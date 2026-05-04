# CSI Intelligence
**Compliance Signals Intelligence — JHS & Associates LLP**

An AI-powered compliance monitoring platform that tracks statutory obligations, detects non-compliance risks, and generates board-ready reports for Indian regulatory frameworks.

---

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Live stats, compliance distribution charts, upcoming deadlines |
| **Companies** | Add/manage companies with CIN, PAN, industry, competitor tracking |
| **Compliance Mapping** | Checklist + calendar views for all statutory deadlines |
| **AI Analysis** | GPT-4o powered risk detection across Companies Act, SEBI, FEMA, GST |
| **Executive Summary** | Board-ready 5–7 page compliance reports |
| **Benchmarking** | AI-generated competitor governance comparison |
| **Question Bank** | Curated questions for Independent Directors & Internal Auditors |
| **Documents** | Upload and manage PDF, Excel, CSV, Word compliance documents |

---

## Setup Instructions

### 1. Prerequisites

- Python 3.10 or higher
- MongoDB (local or MongoDB Atlas)
- OpenAI API key (GPT-4o access)

### 2. Install MongoDB (Local)

**Windows:** Download from https://www.mongodb.com/try/download/community  
**Mac:** `brew install mongodb-community`  
**Ubuntu:** `sudo apt install mongodb`

Start MongoDB:
```
# Windows (run as service, or):
mongod

# Mac/Linux:
brew services start mongodb-community
# or:
sudo systemctl start mongod
```

### 3. Clone / Download the Project

Place all files in a folder, e.g. `csi-intelligence/`

```
csi-intelligence/
├── main.py
├── requirements.txt
├── .env.example
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

### 4. Set Up Python Environment

```bash
cd csi-intelligence

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 5. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your keys:
OPENAI_API_KEY=sk-your-actual-key-here
MONGODB_URL=mongodb://localhost:27017
```

### 6. Run the Application

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open your browser at: **http://localhost:8000**

---

## Quick Start Guide

1. **Add a Company** → Go to Companies → Click "Add Company" → Fill CIN, PAN, industry, and competitors
2. **Seed Compliance Items** → In Compliance Mapping → Click "Seed Defaults" → Select company → All 23 standard Indian statutory deadlines auto-populate
3. **Run AI Analysis** → Go to AI Analysis → Select company → Click "Run Analysis" → GPT-4o analyses all compliance items and flags risks
4. **Generate Executive Summary** → Go to Exec Summary → Select company → Generate a board-ready report
5. **Benchmark Competitors** → Go to Benchmarking → Select company (must have competitors set) → Run Benchmark
6. **Generate Question Bank** → Go to Question Bank → Select company → Choose Directors or Auditors → Generate

---

## Compliance Frameworks Covered

- **Companies Act 2013** — Board meetings, AGM, ROC filings, CSR, auditor appointments
- **SEBI LODR** — Listed company disclosure obligations, quarterly results, related party transactions
- **SEBI ICDR** — Issue and listing compliance for capital raises
- **FEMA / RBI** — Foreign exchange transactions, ECB, ODI, FDI reporting
- **Income Tax / GST** — TDS returns, advance tax, GST filings, annual returns

---

## Deployment on Server

```bash
# Install production server
pip install gunicorn

# Run with gunicorn (Linux/Mac)
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# Or keep using uvicorn without --reload
uvicorn main:app --host 0.0.0.0 --port 8000
```

For HTTPS/domain, put nginx in front as a reverse proxy.

---

## API Reference

The backend exposes a REST API at `/api/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/companies` | List / create companies |
| PUT/DELETE | `/api/companies/{id}` | Update / delete company |
| GET/POST | `/api/compliance` | List / create compliance items |
| POST | `/api/compliance/seed/{company_id}` | Auto-seed 23 statutory deadlines |
| POST | `/api/analysis` | Run AI risk analysis |
| POST | `/api/summary` | Generate executive summary |
| POST | `/api/benchmarking` | Run competitor benchmark |
| POST | `/api/questions` | Generate question bank |
| POST/GET | `/api/documents` | Upload / list documents |
| GET | `/api/dashboard` | Dashboard stats |

Interactive API docs: **http://localhost:8000/docs**

---

## Troubleshooting

**MongoDB connection error** → Make sure MongoDB is running (`mongod` or check services)  
**OpenAI error** → Check your API key in `.env`, ensure you have GPT-4o access  
**Port already in use** → Change port: `uvicorn main:app --port 8001`  
**Module not found** → Ensure venv is activated and `pip install -r requirements.txt` ran successfully

---

*Built for JHS & Associates LLP | Powered by FastAPI + MongoDB + OpenAI GPT-4o*
