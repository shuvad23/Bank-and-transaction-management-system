from datetime import datetime, timedelta
from collections import defaultdict
from bson import ObjectId
from fastapi import HTTPException

from models.transaction import TransactionResponse
from database.connection import get_database
from services.cache_service import cache


def serialize_transaction(txn: dict) -> TransactionResponse:
    return TransactionResponse(
        id=str(txn["_id"]),
        txn_id=txn.get("txn_id") or f"TXN-{str(txn['_id'])[-8:].upper()}",
        transaction_type=txn["transaction_type"],
        amount=txn["amount"],
        balance_after=txn["balance_after"],
        from_account=txn.get("from_account"),
        to_account=txn.get("to_account"),
        description=txn.get("description"),
        status=txn.get("status", "completed"),
        fraud_score=txn.get("fraud_score", 0),
        fraud_reasons=txn.get("fraud_reasons", []) or [],
        created_at=txn["created_at"],
    )


async def get_account_transactions(account_number: str, limit: int = 50, skip: int = 0) -> list[TransactionResponse]:
    db = get_database()
    if isinstance(db, dict):
        query = [t for t in db["transactions"]
                 if t.get("from_account") == account_number or t.get("to_account") == account_number]
        transactions = sorted(query, key=lambda t: t["created_at"], reverse=True)[skip:skip + limit]
    else:
        query = {
            "$or": [{"from_account": account_number}, {"to_account": account_number}]
        }
        transactions = await db.transactions.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [serialize_transaction(t) for t in transactions]


async def get_all_transactions(limit: int = 100, skip: int = 0) -> list[TransactionResponse]:
    db = get_database()
    if isinstance(db, dict):
        transactions = sorted(db["transactions"], key=lambda t: t["created_at"], reverse=True)[skip:skip + limit]
    else:
        transactions = await db.transactions.find().sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [serialize_transaction(t) for t in transactions]


async def get_all_users_admin(limit: int = 100, skip: int = 0) -> list[dict]:
    db = get_database()
    if isinstance(db, dict):
        users = sorted(db["users"], key=lambda u: u["created_at"], reverse=True)[skip:skip + limit]
        result = []
        for u in users:
            u_copy = u.copy()
            u_copy["id"] = u_copy.pop("_id")
            u_copy.pop("hashed_password", None)
            result.append(u_copy)
    else:
        users = await db.users.find({}, {"hashed_password": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        result = []
        for u in users:
            u["id"] = str(u.pop("_id"))
            result.append(u)
    return result


async def get_system_stats() -> dict:
    """Cached system-wide stats (TTL 30s)."""
    cache_key = "admin:stats"
    cached = await cache.get_json(cache_key)
    if cached is not None:
        return cached

    db = get_database()
    if isinstance(db, dict):
        total_users = len(db["users"])
        total_accounts = len([a for a in db["accounts"] if a["is_active"]])
        total_transactions = len(db["transactions"])
        total_balance = sum(a["balance"] for a in db["accounts"] if a["is_active"])
        flagged = len([t for t in db["transactions"] if t.get("status") == "flagged"])
    else:
        total_users = await db.users.count_documents({})
        total_accounts = await db.accounts.count_documents({"is_active": True})
        total_transactions = await db.transactions.count_documents({})
        pipeline = [{"$match": {"is_active": True}},
                    {"$group": {"_id": None, "total": {"$sum": "$balance"}}}]
        result = await db.accounts.aggregate(pipeline).to_list(1)
        total_balance = result[0]["total"] if result else 0
        flagged = await db.transactions.count_documents({"status": "flagged"})

    stats = {
        "total_users": total_users,
        "total_accounts": total_accounts,
        "total_transactions": total_transactions,
        "total_balance_in_system": round(total_balance, 2),
        "flagged_transactions": flagged,
        "cache_backend": cache.backend_name,
    }
    await cache.set_json(cache_key, stats, ttl=30)
    return stats


async def get_chart_data(days: int = 7) -> dict:
    """Aggregated chart data for the admin dashboard.

    Returns:
        - daily_volume: list of {date, deposit, withdrawal, transfer} totals
        - txn_breakdown: list of {type, count, total_amount}
        - balance_growth: cumulative system balance per day
    """
    cache_key = f"admin:charts:{days}"
    cached = await cache.get_json(cache_key)
    if cached is not None:
        return cached

    db = get_database()
    cutoff = datetime.utcnow() - timedelta(days=days)

    if isinstance(db, dict):
        txns = [t for t in db["transactions"] if t["created_at"] >= cutoff]
    else:
        txns = await db.transactions.find({"created_at": {"$gte": cutoff}}).to_list(10_000)

    # Initialize day buckets so empty days show up as 0
    day_keys = []
    for i in range(days - 1, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
        day_keys.append(d)

    daily = {d: {"date": d, "deposit": 0.0, "withdrawal": 0.0,
                 "transfer_out": 0.0, "transfer_in": 0.0} for d in day_keys}
    counts = defaultdict(int)
    totals = defaultdict(float)

    for t in txns:
        day = t["created_at"].strftime("%Y-%m-%d")
        ttype = t["transaction_type"]
        if day in daily and ttype in daily[day]:
            daily[day][ttype] += float(t["amount"])
        counts[ttype] += 1
        totals[ttype] += float(t["amount"])

    breakdown = [
        {"type": k, "count": counts[k], "total_amount": round(totals[k], 2)}
        for k in ["deposit", "withdrawal", "transfer_out", "transfer_in"]
    ]

    data = {
        "daily_volume": [
            {**v, "deposit": round(v["deposit"], 2),
             "withdrawal": round(v["withdrawal"], 2),
             "transfer_out": round(v["transfer_out"], 2),
             "transfer_in": round(v["transfer_in"], 2)}
            for v in daily.values()
        ],
        "txn_breakdown": breakdown,
    }
    await cache.set_json(cache_key, data, ttl=30)
    return data


async def get_user_chart_data(user_id: str, days: int = 7) -> dict:
    """Per-user chart data for the dashboard."""
    db = get_database()
    cutoff = datetime.utcnow() - timedelta(days=days)

    if isinstance(db, dict):
        accounts = [a for a in db["accounts"] if a["user_id"] == user_id and a["is_active"]]
        account_nums = {a["account_number"] for a in accounts}
        txns = [t for t in db["transactions"]
                if t["created_at"] >= cutoff
                and (t.get("from_account") in account_nums or t.get("to_account") in account_nums)]
    else:
        accounts = await db.accounts.find({"user_id": user_id, "is_active": True}).to_list(100)
        account_nums = {a["account_number"] for a in accounts}
        if not account_nums:
            return {"daily_volume": [], "txn_breakdown": [], "balance_distribution": []}
        txns = await db.transactions.find({
            "created_at": {"$gte": cutoff},
            "$or": [{"from_account": {"$in": list(account_nums)}},
                    {"to_account": {"$in": list(account_nums)}}],
        }).to_list(10_000)

    day_keys = []
    for i in range(days - 1, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
        day_keys.append(d)

    daily = {d: {"date": d, "in": 0.0, "out": 0.0} for d in day_keys}
    counts = defaultdict(int)
    totals = defaultdict(float)

    for t in txns:
        day = t["created_at"].strftime("%Y-%m-%d")
        ttype = t["transaction_type"]
        amt = float(t["amount"])
        if day in daily:
            if ttype in ("deposit", "transfer_in"):
                daily[day]["in"] += amt
            else:
                daily[day]["out"] += amt
        counts[ttype] += 1
        totals[ttype] += amt

    breakdown = [
        {"type": k, "count": counts[k], "total_amount": round(totals[k], 2)}
        for k in ["deposit", "withdrawal", "transfer_out", "transfer_in"]
        if counts[k] > 0
    ]

    distribution = [
        {"account_number": a["account_number"],
         "account_type": a["account_type"],
         "balance": round(a["balance"], 2)}
        for a in accounts
    ]

    return {
        "daily_volume": [{"date": v["date"],
                          "in": round(v["in"], 2),
                          "out": round(v["out"], 2)} for v in daily.values()],
        "txn_breakdown": breakdown,
        "balance_distribution": distribution,
    }
