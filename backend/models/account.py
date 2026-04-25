import re
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime


# Stricter validation rules used across deposit / withdraw / transfer endpoints
MAX_TRANSACTION_AMOUNT = 1_000_000.0
MAX_INITIAL_DEPOSIT = 1_000_000.0
ACCOUNT_NUMBER_PATTERN = re.compile(r"^BNK\d{9}$")


def _validate_amount(v: float) -> float:
    if v <= 0:
        raise ValueError("Amount must be greater than zero")
    if v > MAX_TRANSACTION_AMOUNT:
        raise ValueError(f"Amount cannot exceed ${MAX_TRANSACTION_AMOUNT:,.0f} per transaction")
    # Round to 2 decimals so we don't accumulate floating-point noise
    return round(float(v), 2)


def _clean_description(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    cleaned = v.strip()
    if not cleaned:
        return None
    return cleaned


# ─── Request Models ───────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    account_type: Literal["savings", "checking", "fixed_deposit"] = "savings"
    initial_deposit: float = Field(0.0, ge=0, description="Opening deposit amount")

    @field_validator("initial_deposit")
    @classmethod
    def check_initial_deposit(cls, v):
        if v < 0:
            raise ValueError("Initial deposit cannot be negative")
        if v > MAX_INITIAL_DEPOSIT:
            raise ValueError(f"Initial deposit cannot exceed ${MAX_INITIAL_DEPOSIT:,.0f}")
        return round(float(v), 2)


class DepositRequest(BaseModel):
    amount: float = Field(..., gt=0)
    description: Optional[str] = Field(None, max_length=200)

    _amt = field_validator("amount")(lambda cls, v: _validate_amount(v))
    _desc = field_validator("description")(lambda cls, v: _clean_description(v))


class WithdrawRequest(BaseModel):
    amount: float = Field(..., gt=0)
    description: Optional[str] = Field(None, max_length=200)

    _amt = field_validator("amount")(lambda cls, v: _validate_amount(v))
    _desc = field_validator("description")(lambda cls, v: _clean_description(v))


class TransferRequest(BaseModel):
    to_account_number: str = Field(..., min_length=10, max_length=20)
    amount: float = Field(..., gt=0)
    description: Optional[str] = Field(None, max_length=200)

    @field_validator("to_account_number")
    @classmethod
    def check_account_number(cls, v):
        v = v.strip().upper()
        if not ACCOUNT_NUMBER_PATTERN.match(v):
            raise ValueError("Account number must be in the format BNK followed by 9 digits")
        return v

    _amt = field_validator("amount")(lambda cls, v: _validate_amount(v))
    _desc = field_validator("description")(lambda cls, v: _clean_description(v))


# ─── Response Models ──────────────────────────────────────────────────────────

class AccountResponse(BaseModel):
    id: str
    user_id: str
    account_number: str
    account_type: str
    balance: float
    is_active: bool
    created_at: datetime


class AccountInDB(BaseModel):
    user_id: str
    account_number: str
    account_type: str
    balance: float = 0.0
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
