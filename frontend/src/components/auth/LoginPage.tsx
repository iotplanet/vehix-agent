import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, Button, Input } from "@heroui/react";
import { Shield, LogIn } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error, token } = useAuthStore();
  const navigate = useNavigate();

  // Already logged in → redirect to fleet
  if (token) return <Navigate to="/fleet" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(username, password);
    if (ok) navigate("/fleet", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex-col gap-2 pt-8 pb-0">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Shield size={24} className="text-blue-400" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Vehix Agent</h1>
          <p className="text-xs text-default-400">智能车队运维平台</p>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} className="text-base" />
            <Input placeholder="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="text-base" />
            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                {error}
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isDisabled={!username || !password}
            >
              {loading ? "登录中..." : "登录"}
              {!loading && <LogIn size={16} className="ml-1" />}
            </Button>
          </form>
          <div className="mt-4 text-xs text-default-400 text-center">
            默认账户: admin / admin123
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
