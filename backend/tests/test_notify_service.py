from unittest.mock import MagicMock, patch


def _make_db(captured):
    db = MagicMock()
    tables = {}

    def table_selector(name):
        if name in tables:
            return tables[name]
        t = MagicMock()
        if name == "app_notifications":
            def _insert(row):
                captured.append(row)
                res = MagicMock()
                res.execute.return_value.data = [{"id": "n-1"}]
                return res
            t.insert.side_effect = _insert
            t.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        elif name == "callers":
            t.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {"user_id": "u-caller-1"}, {"user_id": "u-caller-2"}, {"user_id": None},
            ]
        elif name == "tenant_users":
            t.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"user_id": "u-owner"}
            ]
        tables[name] = t
        return t

    db.table.side_effect = table_selector
    return db


def test_notify_user_inserts_one_row():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_user("t-1", "u-1", "lead_assigned", "New lead", "Call Asha", db=db)
    assert len(captured) == 1
    assert captured[0]["user_id"] == "u-1"
    assert captured[0]["type"] == "lead_assigned"
    assert captured[0]["tenant_id"] == "t-1"


def test_notify_user_dedupe_skips_when_unread_exists():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    db.table("app_notifications").select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"id": "old"}]
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_user("t-1", "u-1", "lead_replied", "Reply", "Asha replied", db=db, dedupe_lead_id="lead-1")
    assert captured == []


def test_notify_pool_fans_out_to_active_callers_and_owner():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_pool("t-1", "handover_new", "Handover", "Ravi needs a human", db=db)
    targets = {r["user_id"] for r in captured}
    assert targets == {"u-caller-1", "u-caller-2", "u-owner"}


def test_notify_pool_excludes_given_user():
    from app.services import notify
    captured = []
    db = _make_db(captured)
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_pool("t-1", "callback_claimable", "Callback", "Ravi", db=db, exclude_user_ids=["u-caller-1"])
    targets = {r["user_id"] for r in captured}
    assert "u-caller-1" not in targets


def test_notify_never_raises_on_db_error():
    from app.services import notify
    db = MagicMock()
    db.table.side_effect = RuntimeError("db down")
    with patch.object(notify, "get_supabase", return_value=db):
        notify.notify_user("t-1", "u-1", "x", "t", "m", db=db)
        notify.notify_pool("t-1", "x", "t", "m", db=db)
