import { useState, type FormEvent } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import Modal from "./Modal";
import { loginUser, registerUser, type AuthResponse } from "../services/auctionService";

export type AuthMode = "login" | "register";

interface AuthModalProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onAuthenticated: (session: AuthResponse) => void;
}

/** RF-01 registro y RF-02 inicio de sesión. Tras registrarse, inicia sesión automáticamente. */
function AuthModal({ mode, onModeChange, onClose, onAuthenticated }: AuthModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        await registerUser({ name, email, password });
      }
      const session = await loginUser({ email, password });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible continuar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isRegister ? "Crea tu cuenta" : "Ingresa a SubastaYa"}
      subtitle={
        isRegister
          ? "Regístrate para publicar artículos y participar en subastas."
          : "Inicia sesión para ver las subastas y pujar en vivo."
      }
      onClose={onClose}
    >
      <form className="form" onSubmit={handleSubmit}>
        {isRegister && (
          <label>
            Nombre completo
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Ana Pérez"
              minLength={2}
              maxLength={80}
              required
              autoFocus
            />
          </label>
        )}

        <label>
          Correo electrónico
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
            required
            autoFocus={!isRegister}
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? "Mínimo 8 caracteres" : "Tu contraseña"}
            minLength={isRegister ? 8 : undefined}
            required
          />
        </label>

        {error && <div className="form-error" role="alert">{error}</div>}

        <button className="primary-button form-submit" type="submit" disabled={loading}>
          {loading ? <Loader2 size={17} className="spin" /> : null}
          {isRegister ? "Crear cuenta" : "Ingresar"}
          {!loading && <ArrowRight size={17} />}
        </button>

        <p className="form-switch">
          {isRegister ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              onModeChange(isRegister ? "login" : "register");
            }}
          >
            {isRegister ? "Inicia sesión" : "Regístrate"}
          </button>
        </p>
      </form>
    </Modal>
  );
}

export default AuthModal;
