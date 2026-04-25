from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status

from core.security import hash_password, verify_password, create_access_token
from models.user import UserRegister, UserLogin, UserResponse, TokenResponse, UserInDB
from database.connection import get_database
from services.audit_service import log_action
from services.notification_service import send_notification


def serialize_user(user: dict) -> UserResponse:
    return UserResponse(
        id=str(user["_id"]),
        full_name=user["full_name"],
        username=user["username"],
        email=user["email"],
        role=user["role"],
        is_active=user["is_active"],
        created_at=user["created_at"],
    )


async def register_user(user_data: UserRegister) -> UserResponse:
    db = get_database()

    if isinstance(db, dict):
        existing = next((u for u in db["users"] if u["email"] == user_data.email), None)
    else:
        existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    if isinstance(db, dict):
        existing_username = next((u for u in db["users"] if u["username"] == user_data.username), None)
    else:
        existing_username = await db.users.find_one({"username": user_data.username})
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken",
        )

    user_in_db = UserInDB(
        full_name=user_data.full_name,
        username=user_data.username,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_data.role,
    )

    user_dict = user_in_db.model_dump()
    user_dict["_id"] = str(ObjectId())

    if isinstance(db, dict):
        db["users"].append(user_dict)
        new_user = user_dict
    else:
        await db.users.insert_one(user_dict)
        new_user = await db.users.find_one({"_id": user_dict["_id"]})
        if new_user is None:
            new_user = user_dict

    await log_action(
        action="USER_REGISTERED",
        user_id=str(new_user["_id"]),
        actor_email=new_user["email"],
        details={"username": new_user["username"], "role": new_user["role"]},
    )
    await send_notification(
        user_id=str(new_user["_id"]),
        email=new_user["email"],
        subject="Welcome to NexBank!",
        body=(f"Hi {new_user['full_name']},\n\n"
              f"Your NexBank account is ready. You can now log in and open your first bank account.\n\n"
              f"— NexBank"),
        category="success",
    )
    return serialize_user(new_user)


async def login_user(credentials: UserLogin) -> TokenResponse:
    db = get_database()

    if isinstance(db, dict):
        user = next((u for u in db["users"] if u["email"] == credentials.email), None)
    else:
        user = await db.users.find_one({"email": credentials.email})
    if not user:
        await log_action(
            action="LOGIN_FAILED",
            actor_email=credentials.email,
            details={"reason": "user not found"},
            severity="warning",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(credentials.password, user["hashed_password"]):
        await log_action(
            action="LOGIN_FAILED",
            user_id=str(user["_id"]),
            actor_email=credentials.email,
            details={"reason": "wrong password"},
            severity="warning",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support.",
        )

    token = create_access_token(data={"sub": str(user["_id"]), "role": user["role"]})

    await log_action(
        action="USER_LOGIN",
        user_id=str(user["_id"]),
        actor_email=user["email"],
        details={"role": user["role"]},
    )

    return TokenResponse(access_token=token, user=serialize_user(user))


async def get_user_by_id(user_id: str) -> UserResponse:
    db = get_database()
    if isinstance(db, dict):
        user = next((u for u in db["users"] if u["_id"] == user_id), None)
    else:
        try:
            user = await db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            user = await db.users.find_one({"_id": user_id})

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize_user(user)
