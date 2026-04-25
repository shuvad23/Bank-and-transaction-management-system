from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime


class TransactionResponse(BaseModel):
    """Transaction data returned in API responses."""
    id: str
    txn_id: str  # Human-readable reference like TXN-AB12CD34
    transaction_type: Literal["deposit", "withdrawal", "transfer_in", "transfer_out"]
    amount: float
    balance_after: float
    from_account: Optional[str] = None
    to_account: Optional[str] = None
    description: Optional[str] = None
    status: str
    fraud_score: int = 0
    fraud_reasons: List[str] = []
    created_at: datetime


class TransactionInDB(BaseModel):
    """Internal representation of a transaction stored in MongoDB."""
    txn_id: str
    transaction_type: str
    amount: float
    balance_after: float
    from_account: Optional[str] = None
    to_account: Optional[str] = None
    description: Optional[str] = None
    status: str = "completed"
    fraud_score: int = 0
    fraud_reasons: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
