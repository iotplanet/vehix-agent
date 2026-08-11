import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, Button, Input, TextField, Label, FieldError, Form } from "@heroui/react";
import { LogIn } from "lucide-react";
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm mx-auto">
        <CardHeader className="flex-col gap-2 pt-8 pb-0">
          <img src="/vehix-logo.svg" alt="Vehix" className="w-14 h-14" />
          <h1 className="text-lg font-bold text-foreground">Vehix Agent</h1>
          <p className="text-xs text-default-400">智能车队运维平台 · 维克斯 AI 助手</p>
        </CardHeader>
        <CardContent className="p-6">
          <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <TextField isRequired name="username">
              <Label>用户名</Label>
              <Input placeholder="请输入用户名" value={username} onChange={(e) => setUsername(e.target.value)} className="text-base" variant="secondary" />
              <FieldError />
            </TextField>
            <TextField isRequired name="password">
              <Label>密码</Label>
              <Input placeholder="请输入密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="text-base" variant="secondary" />
              <FieldError />
            </TextField>
            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                {error}
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isDisabled={!username || !password || loading}
            >
              {loading ? "登录中..." : "登录"}
              {!loading && <LogIn size={16} className="ml-1" />}
            </Button>
          </Form>
          <div className="mt-4 text-xs text-default-400 text-center">
            默认账户: admin / admin123
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
