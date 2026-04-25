import random
import string
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status

from models.account import AccountCreate, AccountResponse, AccountInDB
from models.transaction import TransactionInDB
from database.connection import get_database
from services.cache_service import cache
from services.fraud_service import evaluate as fraud_evaluate
from services.audit_service import log_action
from services.notification_service import send_notification
from services.ws_manager import ws_manager
import asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────

def generate_account_number() -> str:
    """Generate a 12-character account number: BNK + 9 digits."""
    return "BNK" + "".join(random.choices(string.digits, k=9))


def generate_txn_id() -> str:
    """Human-readable transaction reference: TXN-XXXXXXXX (8 uppercase chars)."""
    chars = string.ascii_uppercase + string.digits
    return "TXN-" + "".join(random.choices(chars, k=8))


def serialize_account(account: dict) -> AccountResponse:
    return AccountResponse(
        id=str(account["_id"]),
        user_id=account["user_id"],
        account_number=account["account_number"],
        account_type=account["account_type"],
        balance=account["balance"],
        is_active=account["is_active"],
        created_at=account["created_at"],
    )


async def _get_user_email(db, user_id: str) -> tuple[str | None, str | None]:
    """Returns (email, full_name) for the given user, or (None, None) if not found."""
    if isinstance(db, dict):
        user = next((u for u in db["users"] if u["_id"] == user_id), None)
    else:
        try:
            user = await db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            try:
                user = await db.users.find_one({"_id": user_id})
            except Exception:
                user = None
    if not user:
        return None, None
    return user.get("email"), user.get("full_name")


async def _persist_txn(db, txn_dict: dict):
    if isinstance(db, dict):
        db["transactions"].append(txn_dict)
    else:
        await db.transactions.insert_one(txn_dict)


async def _invalidate_caches():
    await cache.invalidate("admin:stats", "admin:charts*", "user:accounts:*")


# ─── Account creation ────────────────────────────────────────────────────────

async def create_account(user_id: str, account_data: AccountCreate) -> AccountResponse:
    db = get_database()

    account_number = generate_account_number()
    if isinstance(db, dict):
        while any(a["account_number"] == account_number for a in db["accounts"]):
            account_number = generate_account_number()
    else:
        while await db.accounts.find_one({"account_number": account_number}):
            account_number = generate_account_number()

    account_in_db = AccountInDB(
        user_id=user_id,
        account_number=account_number,
        account_type=account_data.account_type,
        balance=account_data.initial_deposit,
    )

    account_dict = account_in_db.model_dump()
    account_dict["_id"] = str(ObjectId())

    if isinstance(db, dict):
        db["accounts"].append(account_dict)
    else:
        result = await db.accounts.insert_one(account_dict)

    if account_data.initial_deposit > 0:
        txn = TransactionInDB(
            txn_id=generate_txn_id(),
            transaction_type="deposit",
            amount=account_data.initial_deposit,
            balance_after=account_data.initial_deposit,
            to_account=account_number,
            description="Initial deposit on account creation",
        )
        txn_dict = txn.model_dump()
        txn_dict["_id"] = str(ObjectId())
        await _persist_txn(db, txn_dict)

    if isinstance(db, dict):
        new_account = account_dict
    else:
        new_account = await db.accounts.find_one({"_id": result.inserted_id})

    email, name = await _get_user_email(db, user_id)
    await log_action(
        action="ACCOUNT_CREATED",
        user_id=user_id,
        actor_email=email,
        target=account_number,
        details={"account_type": account_data.account_type, "initial_deposit": account_data.initial_deposit},
    )
    if email:
        await send_notification(
            user_id=user_id,
            email=email,
            subject=f"New {account_data.account_type} account opened",
            body=(
                f"Hi {name or 'there'},\n\n"
                f"Your new {account_data.account_type} account ({account_number}) is ready to use.\n"
                f"Opening balance: ${account_data.initial_deposit:,.2f}\n\n"
                f"— NexBank"
            ),
            category="success",
            metadata={"account_number": account_number},
        )

    await _invalidate_caches()
    asyncio.create_task(ws_manager.broadcast_event("account.created", {
        "account_number": account_number, "user_id": user_id,
    }, user_id=user_id))

    return serialize_account(new_account)


# ─── Account reads ────────────────────────────────────────────────────────────

async def get_user_accounts(user_id: str) -> list[AccountResponse]:
    db = get_database()
    cache_key = f"user:accounts:{user_id}"
    cached = await cache.get_json(cache_key)
    if cached is not None:
        return [AccountResponse(**a) for a in cached]

    if isinstance(db, dict):
        accounts = [a for a in db["accounts"] if a["user_id"] == user_id and a["is_active"]]
    else:
        accounts = await db.accounts.find({"user_id": user_id, "is_active": True}).to_list(100)

    serialized = [serialize_account(a) for a in accounts]
    await cache.set_json(cache_key, [s.model_dump(mode="json") for s in serialized], ttl=10)
    return serialized


async def get_account_by_number(account_number: str) -> AccountResponse:
    db = get_database()
    if isinstance(db, dict):
        account = next((a for a in db["accounts"] if a["account_number"] == account_number), None)
    else:
        account = await db.accounts.find_one({"account_number": account_number})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return serialize_account(account)


# ─── Money movement ───────────────────────────────────────────────────────────

async def _record_and_notify_money_event(
    db,
    *,
    user_id: str,
    account: dict,
    txn: TransactionInDB,
    counterparty: str | None,
    fraud: dict,
):
    """Shared helper: persist txn, audit, notify, broadcast WS, invalidate cache."""
    txn_dict = txn.model_dump()
    txn_dict["_id"] = str(ObjectId())
    await _persist_txn(db, txn_dict)

    email, name = await _get_user_email(db, user_id)

    severity = "critical" if fraud["decision"] == "block" else (
        "warning" if fraud["decision"] == "flag" else "info"
    )
    await log_action(
        action=f"TXN_{txn.transaction_type.upper()}",
        user_id=user_id,
        actor_email=email,
        target=account["account_number"],
        details={
            "txn_id": txn.txn_id,
            "amount": txn.amount,
            "fraud_score": fraud["score"],
            "fraud_decision": fraud["decision"],
            "fraud_reasons": fraud["reasons"],
            "counterparty": counterparty,
        },
        severity=severity,
    )

    if email:
        emoji = {"deposit": "💰", "withdrawal": "💸", "transfer_out": "↗", "transfer_in": "↙"}.get(txn.transaction_type, "🔔")
        type_label = txn.transaction_type.replace("_", " ").title()
        body = (
            f"Hi {name or 'there'},\n\n"
            f"{emoji} {type_label} of ${txn.amount:,.2f} on account {account['account_number']}.\n"
            f"Reference: {txn.txn_id}\n"
            f"New balance: ${txn.balance_after:,.2f}\n"
            f"Status: {txn.status.upper()}\n\n"
            f"— NexBank"
        )
        if fraud["decision"] != "clear":
            body += "\n\n⚠️ This transaction was reviewed by our fraud-detection system: " \
                    + "; ".join(fraud["reasons"])
        category = "danger" if fraud["decision"] == "block" else (
            "warning" if fraud["decision"] == "flag" else "success"
        )
        await send_notification(
            user_id=user_id,
            email=email,
            subject=f"{type_label}: ${txn.amount:,.2f} ({txn.txn_id})",
            body=body,
            category=category,
            metadata={"txn_id": txn.txn_id, "account_number": account["account_number"]},
        )

    asyncio.create_task(ws_manager.broadcast_event("transaction.new", {
        "txn_id": txn.txn_id,
        "type": txn.transaction_type,
        "amount": txn.amount,
        "from_account": txn.from_account,
        "to_account": txn.to_account,
        "balance_after": txn.balance_after,
        "status": txn.status,
        "fraud_score": fraud["score"],
        "fraud_decision": fraud["decision"],
        "user_id": user_id,
    }, user_id=user_id))

    if fraud["decision"] != "clear":
        asyncio.create_task(ws_manager.broadcast_to_role("admin", "fraud.alert", {
            "txn_id": txn.txn_id,
            "account_number": account["account_number"],
            "amount": txn.amount,
            "score": fraud["score"],
            "decision": fraud["decision"],
            "reasons": fraud["reasons"],
        }))

    await _invalidate_caches()


async def deposit(user_id: str, account_number: str, amount: float, description: str = None) -> AccountResponse:
    db = get_database()

    if isinstance(db, dict):
        account = next((a for a in db["accounts"]
                        if a["account_number"] == account_number
                        and a["user_id"] == user_id and a["is_active"]), None)
    else:
        account = await db.accounts.find_one({
            "account_number": account_number, "user_id": user_id, "is_active": True,
        })
    if not account:
        raise HTTPException(status_code=404, detail="Account not found or access denied")

    fraud = await fraud_evaluate(account_number, amount, account["balance"], "deposit")
    # Deposits are inflows so we don't block them — only flag if rules trip.
    status_str = "flagged" if fraud["decision"] != "clear" else "completed"

    new_balance = round(account["balance"] + amount, 2)
    if isinstance(db, dict):
        account["balance"] = new_balance
    else:
        await db.accounts.update_one(
            {"account_number": account_number}, {"$set": {"balance": new_balance}}
        )

    txn = TransactionInDB(
        txn_id=generate_txn_id(),
        transaction_type="deposit",
        amount=amount,
        balance_after=new_balance,
        to_account=account_number,
        description=description or "Deposit",
        status=status_str,
        fraud_score=fraud["score"],
        fraud_reasons=fraud["reasons"],
    )
    await _record_and_notify_money_event(db, user_id=user_id, account=account, txn=txn,
                                         counterparty=None, fraud=fraud)

    if isinstance(db, dict):
        updated = account
    else:
        updated = await db.accounts.find_one({"account_number": account_number})
    return serialize_account(updated)


async def withdraw(user_id: str, account_number: str, amount: float, description: str = None) -> AccountResponse:
    db = get_database()

    if isinstance(db, dict):
        account = next((a for a in db["accounts"]
                        if a["account_number"] == account_number
                        and a["user_id"] == user_id and a["is_active"]), None)
    else:
        account = await db.accounts.find_one({
            "account_number": account_number, "user_id": user_id, "is_active": True,
        })
    if not account:
        raise HTTPException(status_code=404, detail="Account not found or access denied")

    if account["balance"] < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient funds. Available balance: ${account['balance']:.2f}",
        )

    fraud = await fraud_evaluate(account_number, amount, account["balance"], "withdrawal")
    if fraud["decision"] == "block":
        # Record a blocked attempt as an audit entry but do not move funds.
        email, _ = await _get_user_email(db, user_id)
        await log_action(
            action="TXN_BLOCKED",
            user_id=user_id, actor_email=email, target=account_number,
            details={"amount": amount, "type": "withdrawal", "reasons": fraud["reasons"]},
            severity="critical",
        )
        if email:
            await send_notification(
                user_id=user_id, email=email,
                subject="⛔ Withdrawal blocked by fraud detection",
                body=("A withdrawal attempt of "
                      f"${amount:,.2f} on account {account_number} was blocked.\n"
                      f"Reasons: {'; '.join(fraud['reasons'])}\n\nIf this was you, please contact support."),
                category="danger",
            )
        asyncio.create_task(ws_manager.broadcast_to_role("admin", "fraud.alert", {
            "account_number": account_number, "amount": amount,
            "score": fraud["score"], "decision": "block", "reasons": fraud["reasons"],
        }))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Transaction blocked by fraud detection: {'; '.join(fraud['reasons'])}",
        )

    new_balance = round(account["balance"] - amount, 2)
    if isinstance(db, dict):
        account["balance"] = new_balance
    else:
        await db.accounts.update_one(
            {"account_number": account_number}, {"$set": {"balance": new_balance}}
        )

    status_str = "flagged" if fraud["decision"] == "flag" else "completed"
    txn = TransactionInDB(
        txn_id=generate_txn_id(),
        transaction_type="withdrawal",
        amount=amount,
        balance_after=new_balance,
        from_account=account_number,
        description=description or "Withdrawal",
        status=status_str,
        fraud_score=fraud["score"],
        fraud_reasons=fraud["reasons"],
    )
    await _record_and_notify_money_event(db, user_id=user_id, account=account, txn=txn,
                                         counterparty=None, fraud=fraud)

    if isinstance(db, dict):
        updated = account
    else:
        updated = await db.accounts.find_one({"account_number": account_number})
    return serialize_account(updated)


async def transfer(user_id: str, from_account_number: str, to_account_number: str,
                   amount: float, description: str = None):
    db = get_database()

    if from_account_number == to_account_number:
        raise HTTPException(status_code=400, detail="Cannot transfer to the same account")

    if isinstance(db, dict):
        from_account = next((a for a in db["accounts"]
                             if a["account_number"] == from_account_number
                             and a["user_id"] == user_id and a["is_active"]), None)
    else:
        from_account = await db.accounts.find_one({
            "account_number": from_account_number, "user_id": user_id, "is_active": True,
        })
    if not from_account:
        raise HTTPException(status_code=404, detail="Source account not found or access denied")

    if from_account["balance"] < amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient funds. Available: ${from_account['balance']:.2f}",
        )

    if isinstance(db, dict):
        to_account = next((a for a in db["accounts"]
                           if a["account_number"] == to_account_number and a["is_active"]), None)
    else:
        to_account = await db.accounts.find_one({
            "account_number": to_account_number, "is_active": True,
        })
    if not to_account:
        raise HTTPException(status_code=404, detail="Destination account not found")

    fraud = await fraud_evaluate(from_account_number, amount, from_account["balance"], "transfer_out")
    if fraud["decision"] == "block":
        email, _ = await _get_user_email(db, user_id)
        await log_action(
            action="TXN_BLOCKED",
            user_id=user_id, actor_email=email, target=from_account_number,
            details={"amount": amount, "type": "transfer_out", "reasons": fraud["reasons"]},
            severity="critical",
        )
        if email:
            await send_notification(
                user_id=user_id, email=email,
                subject="⛔ Transfer blocked by fraud detection",
                body=(f"A transfer attempt of ${amount:,.2f} from {from_account_number} to "
                      f"{to_account_number} was blocked.\nReasons: {'; '.join(fraud['reasons'])}"),
                category="danger",
            )
        asyncio.create_task(ws_manager.broadcast_to_role("admin", "fraud.alert", {
            "account_number": from_account_number, "amount": amount,
            "score": fraud["score"], "decision": "block", "reasons": fraud["reasons"],
        }))
        raise HTTPException(
            status_code=403,
            detail=f"Transaction blocked by fraud detection: {'; '.join(fraud['reasons'])}",
        )

    new_from_balance = round(from_account["balance"] - amount, 2)
    new_to_balance = round(to_account["balance"] + amount, 2)
    desc = description or f"Transfer to {to_account_number}"
    status_str = "flagged" if fraud["decision"] == "flag" else "completed"

    if isinstance(db, dict):
        from_account["balance"] = new_from_balance
        to_account["balance"] = new_to_balance
    else:
        await db.accounts.update_one(
            {"account_number": from_account_number}, {"$set": {"balance": new_from_balance}}
        )
        await db.accounts.update_one(
            {"account_number": to_account_number}, {"$set": {"balance": new_to_balance}}
        )

    now = datetime.utcnow()

    # Outgoing leg
    txn_out = TransactionInDB(
        txn_id=generate_txn_id(),
        transaction_type="transfer_out",
        amount=amount,
        balance_after=new_from_balance,
        from_account=from_account_number,
        to_account=to_account_number,
        description=desc,
        status=status_str,
        fraud_score=fraud["score"],
        fraud_reasons=fraud["reasons"],
        created_at=now,
    )
    await _record_and_notify_money_event(db, user_id=user_id, account=from_account, txn=txn_out,
                                         counterparty=to_account_number, fraud=fraud)

    # Incoming leg (notify the receiver too)
    txn_in = TransactionInDB(
        txn_id=generate_txn_id(),
        transaction_type="transfer_in",
        amount=amount,
        balance_after=new_to_balance,
        from_account=from_account_number,
        to_account=to_account_number,
        description=f"Transfer from {from_account_number}",
        status="completed",
        created_at=now,
    )
    txn_in_dict = txn_in.model_dump()
    txn_in_dict["_id"] = str(ObjectId())
    await _persist_txn(db, txn_in_dict)

    receiver_email, receiver_name = await _get_user_email(db, to_account["user_id"])
    if receiver_email:
        await send_notification(
            user_id=to_account["user_id"],
            email=receiver_email,
            subject=f"Incoming transfer: ${amount:,.2f} ({txn_in.txn_id})",
            body=(f"Hi {receiver_name or 'there'},\n\n"
                  f"You received ${amount:,.2f} on account {to_account_number} "
                  f"from {from_account_number}.\nReference: {txn_in.txn_id}\n"
                  f"New balance: ${new_to_balance:,.2f}\n\n— NexBank"),
            category="success",
            metadata={"txn_id": txn_in.txn_id, "account_number": to_account_number},
        )
    asyncio.create_task(ws_manager.broadcast_event("transaction.new", {
        "txn_id": txn_in.txn_id,
        "type": "transfer_in",
        "amount": amount,
        "from_account": from_account_number,
        "to_account": to_account_number,
        "balance_after": new_to_balance,
        "status": "completed",
        "user_id": to_account["user_id"],
    }, user_id=to_account["user_id"]))

    await _invalidate_caches()

    if isinstance(db, dict):
        updated_from = from_account
    else:
        updated_from = await db.accounts.find_one({"account_number": from_account_number})
    return serialize_account(updated_from)
