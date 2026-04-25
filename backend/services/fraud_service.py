"""Lightweight rule-based fraud detection.

Each transaction is scored before it is applied. Score breakdown:

  high_amount           +40   single transaction > $10,000
  very_high_amount      +60   single transaction > $50,000
  large_balance_drain   +30   spending > 80% of available balance
  rapid_fire            +25   >5 transactions in the last 60 seconds
  daily_outflow_high    +20   >$50,000 already spent today

Decisions:
  score >= 80    → BLOCK (transaction rejected)
  score >= 40    → FLAG  (transaction allowed but marked & alerted)
  score <  40    → CLEAR
"""
from datetime import datetime, timedelta
from database.connection import get_database


HIGH_AMOUNT_THRESHOLD = 10_000
VERY_HIGH_AMOUNT_THRESHOLD = 50_000
DAILY_OUTFLOW_THRESHOLD = 50_000
RAPID_WINDOW_SECONDS = 60
RAPID_TXN_LIMIT = 5
BALANCE_DRAIN_RATIO = 0.8

BLOCK_THRESHOLD = 80
FLAG_THRESHOLD = 40


async def _outgoing_txns_for_account(account_number: str):
    db = get_database()
    if isinstance(db, dict):
        return [t for t in db["transactions"]
                if t.get("from_account") == account_number
                and t.get("transaction_type") in ("withdrawal", "transfer_out")]
    cursor = db.transactions.find({
        "from_account": account_number,
        "transaction_type": {"$in": ["withdrawal", "transfer_out"]},
    })
    return await cursor.to_list(1000)


async def evaluate(
    account_number: str,
    amount: float,
    current_balance: float,
    txn_type: str,
) -> dict:
    """Run all fraud rules and return a decision dict.

    Returns:
        {
          "score": int,
          "decision": "clear" | "flag" | "block",
          "reasons": list[str],
        }
    """
    reasons: list[str] = []
    score = 0

    if amount > VERY_HIGH_AMOUNT_THRESHOLD:
        score += 60
        reasons.append(f"Very high single amount (${amount:,.2f})")
    elif amount > HIGH_AMOUNT_THRESHOLD:
        score += 40
        reasons.append(f"High single amount (${amount:,.2f})")

    if txn_type in ("withdrawal", "transfer_out") and current_balance > 0:
        if amount / current_balance >= BALANCE_DRAIN_RATIO:
            score += 30
            pct = round((amount / current_balance) * 100)
            reasons.append(f"Spending {pct}% of available balance in one transaction")

    outgoing = await _outgoing_txns_for_account(account_number)
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=RAPID_WINDOW_SECONDS)
    recent = [t for t in outgoing if t["created_at"] >= cutoff]
    if len(recent) >= RAPID_TXN_LIMIT:
        score += 25
        reasons.append(f"{len(recent)} transactions in the last {RAPID_WINDOW_SECONDS}s")

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_outflow = sum(t["amount"] for t in outgoing if t["created_at"] >= today_start)
    if today_outflow + amount > DAILY_OUTFLOW_THRESHOLD:
        score += 20
        reasons.append(
            f"Daily outflow would reach ${today_outflow + amount:,.2f} "
            f"(limit ${DAILY_OUTFLOW_THRESHOLD:,})"
        )

    if score >= BLOCK_THRESHOLD:
        decision = "block"
    elif score >= FLAG_THRESHOLD:
        decision = "flag"
    else:
        decision = "clear"

    return {"score": score, "decision": decision, "reasons": reasons}
