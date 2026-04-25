from fastapi import APIRouter, Depends
from models.account import AccountCreate, AccountResponse, DepositRequest, WithdrawRequest, TransferRequest
from services.account_service import (
    create_account, get_user_accounts, deposit, withdraw, transfer, get_account_by_number
)
from services.transaction_service import get_account_transactions
from models.transaction import TransactionResponse
from core.security import get_current_user

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])


@router.post("/", response_model=AccountResponse, status_code=201)
async def create_new_account(
    account_data: AccountCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new bank account for the logged-in user."""
    return await create_account(current_user["user_id"], account_data)


@router.get("/", response_model=list[AccountResponse])
async def list_my_accounts(current_user: dict = Depends(get_current_user)):
    """Get all accounts belonging to the logged-in user."""
    return await get_user_accounts(current_user["user_id"])


@router.get("/{account_number}", response_model=AccountResponse)
async def get_account(account_number: str, current_user: dict = Depends(get_current_user)):
    """Get details of a specific account by its account number."""
    return await get_account_by_number(account_number)


@router.post("/{account_number}/deposit", response_model=AccountResponse)
async def deposit_money(
    account_number: str,
    request: DepositRequest,
    current_user: dict = Depends(get_current_user)
):
    """Deposit money into one of your accounts."""
    return await deposit(
        current_user["user_id"], account_number, request.amount, request.description
    )


@router.post("/{account_number}/withdraw", response_model=AccountResponse)
async def withdraw_money(
    account_number: str,
    request: WithdrawRequest,
    current_user: dict = Depends(get_current_user)
):
    """Withdraw money from one of your accounts."""
    return await withdraw(
        current_user["user_id"], account_number, request.amount, request.description
    )


@router.post("/{account_number}/transfer", response_model=AccountResponse)
async def transfer_money(
    account_number: str,
    request: TransferRequest,
    current_user: dict = Depends(get_current_user)
):
    """Transfer money from your account to another account."""
    return await transfer(
        current_user["user_id"],
        account_number,
        request.to_account_number,
        request.amount,
        request.description
    )


@router.get("/{account_number}/transactions", response_model=list[TransactionResponse])
async def get_transactions(
    account_number: str,
    limit: int = 50,
    skip: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Get transaction history for a specific account."""
    return await get_account_transactions(account_number, limit, skip)
