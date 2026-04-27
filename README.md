# 🏦 NexBank — Bank & Transaction Management System
### Complete Setup, Development & Deployment Guide

https://nexbank-4b.vercel.app/login

---

## 📁 Project Structure

```
bank-management-system/
├── backend/
│   ├── core/
│   │   ├── config.py          # App settings from .env
│   │   └── security.py        # JWT + bcrypt password hashing
│   ├── database/
│   │   └── connection.py      # MongoDB Atlas connection (Motor async)
│   ├── models/
│   │   ├── user.py            # Pydantic schemas for users
│   │   ├── account.py         # Pydantic schemas for accounts
│   │   └── transaction.py     # Pydantic schemas for transactions
│   ├── routes/
│   │   ├── auth.py            # /api/auth/* endpoints
│   │   ├── accounts.py        # /api/accounts/* endpoints
│   │   └── admin.py           # /api/admin/* endpoints (admin only)
│   ├── services/
│   │   ├── auth_service.py        # Registration, login logic
│   │   ├── account_service.py     # Deposit, withdraw, transfer logic
│   │   └── transaction_service.py # Transaction history, admin stats
│   ├── main.py                # FastAPI app entry point
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── context/
    │   │   └── AuthContext.jsx    # Global auth state (React Context)
    │   ├── services/
    │   │   └── api.js             # Axios instance + all API calls
    │   ├── components/
    │   │   ├── Navbar.jsx         # Top navigation bar
    │   │   ├── Layout.jsx         # Page wrapper with Navbar
    │   │   └── ProtectedRoute.jsx # Auth guard for private pages
    │   ├── pages/
    │   │   ├── Login.jsx          # Login page
    │   │   ├── Register.jsx       # Registration page
    │   │   ├── Dashboard.jsx      # Home: balances + recent txns
    │   │   ├── Accounts.jsx       # Account management
    │   │   ├── Transfer.jsx       # Transfer / Deposit / Withdraw UI
    │   │   ├── Transactions.jsx   # Full transaction history
    │   │   └── Admin.jsx          # Admin-only dashboard
    │   ├── App.jsx                # Router setup
    │   ├── main.jsx               # React entry point
    │   └── index.css              # Global styles + design system
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── .env.example
```

---

## ⚙️ Step 1: MongoDB Atlas Setup

1. Go to https://www.mongodb.com/atlas and create a free account.
2. Click **"Build a Database"** → choose **Free (M0)** → pick any region → click **Create**.
3. Set up a database user:
   - Username: `bankadmin`
   - Password: something strong (save it!)
4. Under **Network Access** → click **"Add IP Address"** → choose **"Allow Access from Anywhere"** (0.0.0.0/0)
   - For production, restrict this to your server's IP.
5. Go to **Database** → click **"Connect"** → **"Connect your application"**
6. Copy the connection string. It looks like:
   ```
   mongodb+srv://bankadmin:<password>@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
   ```
7. Replace `<password>` with your actual password and add your database name:
   ```
   mongodb+srv://bankadmin:yourpassword@cluster0.abc123.mongodb.net/bank_management?retryWrites=true&w=majority
   ```

---

## ⚙️ Step 2: Backend Local Setup

### 2.1 — Prerequisites
- Python 3.11 or newer → https://python.org/downloads
- Verify: `python --version`

### 2.2 — Create Virtual Environment
```bash
cd bank-management-system/backend

# Create virtual environment
python -m venv venv

# Activate it:
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

### 2.3 — Install Dependencies
```bash
pip install -r requirements.txt
```

### 2.4 — Create Your .env File
```bash
# Copy the example file
cp .env.example .env
```

Now open `.env` in any text editor and fill it in:
```env
MONGODB_URL=mongodb+srv://bankadmin:yourpassword@cluster0.abc123.mongodb.net/bank_management?retryWrites=true&w=majority
DATABASE_NAME=bank_management
SECRET_KEY=generate-a-random-256-bit-string-here-use-openssl-rand-hex-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**Generate a secure SECRET_KEY:**
```bash
# Run this in your terminal:
python -c "import secrets; print(secrets.token_hex(32))"
```
Copy the output and paste it as your SECRET_KEY.

### 2.5 — Run the Backend
```bash
uvicorn main:app --reload --port 8000
```

You should see:
```
Connecting to MongoDB Atlas...
✅ Connected to MongoDB Atlas successfully!
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Visit **http://localhost:8000/docs** to see the interactive API documentation (Swagger UI).

---

## 🎨 Step 3: Frontend Local Setup

### 3.1 — Prerequisites
- Node.js 18+ → https://nodejs.org
- Verify: `node --version` and `npm --version`

### 3.2 — Install Dependencies
```bash
cd bank-management-system/frontend
npm install
```

### 3.3 — Create Your Frontend .env File
```bash
cp .env.example .env
```

Open `.env`:
```env
VITE_API_URL=http://localhost:8000
```

### 3.4 — Run the Frontend
```bash
npm run dev
```

Visit **http://localhost:5173** in your browser.

---

## 🔗 Step 4: Connecting Frontend ↔ Backend

The frontend connects to the backend in two ways:

**Option A — Via Vite proxy (recommended for development)**
The `vite.config.js` already proxies `/api` calls to `http://localhost:8000`, so CORS is not an issue locally.

**Option B — Direct via VITE_API_URL**
The `src/services/api.js` uses `import.meta.env.VITE_API_URL` as the base URL for all Axios calls. This is used in production.

Make sure both servers are running simultaneously:
- Backend on port **8000**
- Frontend on port **5173**

---

## 🧪 Step 5: Testing with Postman

Import these example requests into Postman:

### Register a User
```
POST http://localhost:8000/api/auth/register
Content-Type: application/json

{
  "full_name": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "password": "secret123",
  "role": "user"
}
```
**Expected Response (201):**
```json
{
  "id": "664abc123...",
  "full_name": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "user",
  "is_active": true,
  "created_at": "2024-06-01T10:00:00"
}
```

### Login
```
POST http://localhost:8000/api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "secret123"
}
```
**Expected Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": { ... }
}
```
**→ Copy the access_token. Use it in all subsequent requests as:**
`Authorization: Bearer <your_token>`

### Create an Account
```
POST http://localhost:8000/api/accounts/
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "account_type": "savings",
  "initial_deposit": 1000.00
}
```
**Expected Response (201):**
```json
{
  "id": "664xyz...",
  "account_number": "BNK123456789",
  "account_type": "savings",
  "balance": 1000.0,
  "is_active": true,
  "created_at": "..."
}
```

### Deposit Money
```
POST http://localhost:8000/api/accounts/BNK123456789/deposit
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "amount": 500.00,
  "description": "Salary deposit"
}
```

### Withdraw Money
```
POST http://localhost:8000/api/accounts/BNK123456789/withdraw
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "amount": 200.00,
  "description": "Groceries"
}
```

### Transfer Money
```
POST http://localhost:8000/api/accounts/BNK123456789/transfer
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "to_account_number": "BNK987654321",
  "amount": 150.00,
  "description": "Rent payment"
}
```

### View Transaction History
```
GET http://localhost:8000/api/accounts/BNK123456789/transactions?limit=20&skip=0
Authorization: Bearer <your_token>
```

### Admin: System Stats
```
GET http://localhost:8000/api/admin/stats
Authorization: Bearer <admin_token>
```

---

## 🗄️ Database Schema Design

### `users` collection
```json
{
  "_id": ObjectId,
  "full_name": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "hashed_password": "$2b$12$...",
  "role": "user",           // "user" or "admin"
  "is_active": true,
  "created_at": ISODate
}
```
**Indexes:** `email` (unique), `username` (unique)

### `accounts` collection
```json
{
  "_id": ObjectId,
  "user_id": "664abc...",         // references users._id
  "account_number": "BNK123456789",
  "account_type": "savings",      // savings | checking | fixed_deposit
  "balance": 1300.00,
  "is_active": true,
  "created_at": ISODate
}
```
**Indexes:** `account_number` (unique), `user_id`

### `transactions` collection
```json
{
  "_id": ObjectId,
  "transaction_type": "transfer_out",  // deposit | withdrawal | transfer_in | transfer_out
  "amount": 150.00,
  "balance_after": 1150.00,
  "from_account": "BNK123456789",
  "to_account": "BNK987654321",
  "description": "Rent payment",
  "status": "completed",
  "created_at": ISODate
}
```
**Indexes:** `from_account`, `to_account`, `created_at`

---

## 🔐 Security Architecture

### JWT Flow
```
1. User sends email + password to POST /api/auth/login
2. Server verifies password with bcrypt.verify()
3. Server creates JWT: { sub: user_id, role: "user", exp: now+60min }
4. Client stores token in localStorage
5. Client sends token in every request: Authorization: Bearer <token>
6. Server decodes token on each protected route via get_current_user dependency
7. Token expires after 60 minutes → user must log in again
```

### Password Hashing
- bcrypt with 12 salt rounds (default passlib setting)
- Passwords are NEVER stored in plain text
- Even if the database is compromised, passwords are safe

### CORS
- Configured in `main.py` via `CORSMiddleware`
- Only origins listed in `ALLOWED_ORIGINS` env var can call the API
- In production: set this to your exact Vercel/Netlify domain

---

## 🚀 Step 6: Deployment

### 6A — Deploy Backend to Render (Free)

1. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/bank-management.git
   git push -u origin main
   ```

2. Go to https://render.com → Sign up → **New** → **Web Service**

3. Connect your GitHub repo → select the `backend` folder as root.

4. Configure the service:
   - **Name:** `bank-management-backend`
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

5. Under **Environment Variables**, add ALL variables from your `.env`:
   ```
   MONGODB_URL       = mongodb+srv://...
   DATABASE_NAME     = bank_management
   SECRET_KEY        = your-secret-key
   ALGORITHM         = HS256
   ACCESS_TOKEN_EXPIRE_MINUTES = 60
   ALLOWED_ORIGINS   = https://your-app.vercel.app
   ```

6. Click **Create Web Service**. Wait ~3 minutes.

7. Your backend URL will be: `https://bank-management-backend.onrender.com`
   - Test it: visit `https://bank-management-backend.onrender.com/docs`

---

### 6B — Deploy Frontend to Vercel (Free)

1. Go to https://vercel.com → Sign up with GitHub

2. Click **"Add New Project"** → Import your GitHub repo

3. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

4. Under **Environment Variables**, add:
   ```
   VITE_API_URL = https://bank-management-backend.onrender.com
   ```

5. Click **Deploy**. Wait ~2 minutes.

6. Your app will be live at: `https://your-app.vercel.app`

7. **Update CORS:** Go back to Render → your backend service → Environment Variables → update:
   ```
   ALLOWED_ORIGINS = https://your-app.vercel.app
   ```
   Then click **Manual Deploy** → **Deploy latest commit**.

---

### 6C — Alternative: Deploy Backend to Railway

1. Go to https://railway.app → Sign up with GitHub
2. New Project → Deploy from GitHub repo
3. Select your repo → set **Root Directory** to `backend`
4. Add environment variables (same as Render above)
5. Railway auto-detects Python and runs uvicorn

---

## 💡 Bonus Features Explained

### Role-Based Access
- `role: "user"` — can only access their own accounts and transactions
- `role: "admin"` — can access `/api/admin/*` routes (all users, all transactions, system stats)
- Role is embedded in the JWT token at login, checked server-side on every request
- Frontend: Admin users see an "Admin" tab in the navbar

### How to Create an Admin User
When registering, set `"role": "admin"` in the request body. In a real app you'd restrict this — only allow admin creation via a special secret code or existing admin approval.

---

## 💡 Future Improvements

1. **Refresh tokens** — Issue short-lived access tokens + long-lived refresh tokens for security
2. **Email verification** — Send verification email on registration (use SendGrid or Resend)
3. **Transaction receipts** — Generate PDF receipts for transfers
4. **Spending analytics** — Charts showing spending by category over time
5. **Rate limiting** — Prevent brute-force login attacks (use slowapi)
6. **Loan management** — Track loan applications and repayment schedules
7. **Multi-currency** — Support USD, EUR, BDT with live exchange rates
8. **Two-factor authentication** — TOTP-based 2FA using pyotp
9. **Mobile app** — React Native frontend sharing the same backend
10. **Audit logs** — Track all admin actions with timestamps

---

## ❓ Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection refused` on backend | Backend not running | Run `uvicorn main:app --reload` |
| `401 Unauthorized` | Token expired or missing | Log in again to get new token |
| `403 Forbidden` | Not admin | Use an admin account |
| `409 Conflict` on register | Email/username taken | Use a different email |
| `400 Insufficient funds` | Balance too low | Deposit money first |
| MongoDB `ServerSelectionTimeoutError` | Wrong connection string | Check `MONGODB_URL` in `.env` |
| CORS error in browser | Origin not allowed | Add frontend URL to `ALLOWED_ORIGINS` |
| Vite env vars not loading | Missing `VITE_` prefix | All frontend env vars must start with `VITE_` |
