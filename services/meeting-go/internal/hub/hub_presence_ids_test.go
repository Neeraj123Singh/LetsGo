package hub

import "testing"

// Regression: Invite lookup returns users.id via ::text — presence keys must agree
// on string identity with what the notify socket registers after JWT → DB lookup.

func TestPresenceOnlineAfterNotifyRegister_GuestUserID(t *testing.T) {
	h := New()

	if h.IsUserOnline("930d4271-bcC2-4d2b-a536-a7e08a3fe8d3") {
		t.Fatal("expected offline before register")
	}

	nc := &NotifyClient{Hub: h, UserID: "930d4271-bcc2-4d2b-a536-a7e08a3fe8d3"}
	h.RegisterNotify(nc)

	// Invite path compares target.ID straight from Postgres (always lowercase canonical).
	ok := h.IsUserOnline("930d4271-bcc2-4d2b-a536-a7e08a3fe8d3")
	h.UnregisterNotify(nc)

	if !ok {
		t.Fatal("expected lowercase target id hit presence after lowercase registration")
	}
}
