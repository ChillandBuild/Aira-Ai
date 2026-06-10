# Todos API

> 12 nodes · cohesion 0.27

## Key Concepts

- **SuccessResponse** (6 connections) — `backend/app/models/schemas.py`
- **TodoCreate** (6 connections) — `backend/app/models/schemas.py`
- **Todo** (6 connections) — `backend/app/models/schemas.py`
- **UUID** (6 connections) — `backend/app/routes/todos.py`
- **TodoBase** (4 connections) — `backend/app/models/schemas.py`
- **date** (4 connections) — `backend/app/routes/todos.py`
- **TodoCreate** (3 connections) — `backend/app/routes/todos.py`
- **TodoUpdate** (3 connections) — `backend/app/routes/todos.py`
- **todos.py** (1 connections) — `backend/app/routes/todos.py`
- **get_todos()** (1 connections) — `backend/app/routes/todos.py`
- **update_todo()** (1 connections) — `backend/app/routes/todos.py`
- **delete_todo()** (1 connections) — `backend/app/routes/todos.py`

## Relationships

- [[Pydantic Schemas]] (6 shared connections)

## Source Files

- `backend/app/models/schemas.py`
- `backend/app/routes/todos.py`

## Audit Trail

- EXTRACTED: 18 (43%)
- INFERRED: 24 (57%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*