import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, Button, Input, TextField, Label, FieldError, Form } from "@heroui/react";
import { LogIn } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

const BASE_URL = import.meta.env.VITE_BASE_URL || "/";
const SHOW_DEMO_CREDENTIALS =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === "true";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error, token } = useAuthStore();
  const navigate = useNavigate();

  if (token) return <Navigate to="/fleet" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(username, password);
    if (ok) navigate("/fleet", { replace: true });
  };

  return (
    <div className="vx-login-stage">
      <div className="vx-login-card vx-fade-in">
        <Card className="bg-content1 border-divider w-full shadow-none">
          <CardHeader className="flex-col gap-2 pt-8 pb-0">
            <img src={`${BASE_URL}vehix-logo.svg`} alt="Vehix" className="w-12 h-12" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">Vehix Agent</h1>
            <p className="text-sm text-default-400">智能车队运维平台</p>
          </CardHeader>
          <CardContent className="p-6 pt-5">
            <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <TextField isRequired name="username">
                <Label>用户名</Label>
                <Input
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="text-base"
                  variant="secondary"
                />
                <FieldError />
              </TextField>
              <TextField isRequired name="password">
                <Label>密码</Label>
                <Input
                  placeholder="请输入密码"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-base"
                  variant="secondary"
                />
                <FieldError />
              </TextField>
              {error && (
                <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-2">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                className="w-full rounded-full"
                isDisabled={!username || !password || loading}
              >
                {loading ? "登录中..." : "登录"}
                {!loading && <LogIn size={16} className="ml-1" />}
              </Button>
            </Form>
            {SHOW_DEMO_CREDENTIALS && (
              <div className="mt-4 text-xs text-default-400 text-center">
                演示账户: admin / admin123
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
