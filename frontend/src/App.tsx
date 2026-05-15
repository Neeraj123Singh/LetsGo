import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { NotifyProvider } from "./notify/NotifyContext";
import { AppShell } from "./layout/AppShell";
import { ProtectedRoute } from "./layout/ProtectedRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Home } from "./pages/Home";
import { Contacts } from "./pages/Contacts";
import { Chats } from "./pages/Chats";
import { ChatThread } from "./pages/ChatThread";
import { Call } from "./pages/Call";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotifyProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/chats" element={<Chats />} />
              <Route path="/chats/:peerId" element={<ChatThread />} />
              <Route path="/call/:roomId" element={<Call />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotifyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
