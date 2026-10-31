import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import lambLogo from "../imports/Logo_principal_branco.png";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, Package, Image as ImageIcon, ShoppingCart,
  BarChart2, Shield, LogOut, Bell, Search, Settings,
  TrendingUp, TrendingDown, AlertTriangle, Plus, Filter,
  Upload, Eye, Edit, Trash2, ArrowLeft, ArrowRight,
  Check, RefreshCw, Download, Truck, Clock, CheckCircle,
  Layers, DollarSign, User, Lock, Mail, Box, FileText,
  CreditCard, Banknote, Zap, RotateCcw, AlertCircle, Calendar, Menu, X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { apiFetch as fetch, setApiToken } from "../lib/api";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const DISPLAY = { fontFamily: "'DM Serif Display', Georgia, serif" };

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ─── Types ────────────────────────────────────────────────────────────────────
export type Product = {
  id: number;
  sku: string;
  nome: string;
  categoria: string;
  preco: number;
  custo: number;
  estoque: number;
  estoque_minimo: number;
  status: string;
};

export type StockMovement = {
  id: number;
  product_id: number;
  tipo: string;
  motivo: string;
  quantidade: number;
  saldo: number;
  created_at: string;
};

export type DTFDesign = {
  id: number;
  nome: string;
  cat: string;
  dpi: number;
  tam: string;
  versoes: number;
  lic: string;
  usos: number;
  hue: string;
  estoque: number;
  has_image?: boolean;
  local_image?: string;
};

export type KCard = {
  id: string;
  cliente: string;
  produto: string;
  dtf: string;
  qtd: number;
  valor_total?: number;
  prazo: string;
  prazo_iso?: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  pagamento?: string;
  status?: string;
  product_id?: number;
  dtf_id?: number;
  created_at?: string;
};

export type ColKey = "aguardando" | "producao" | "finalizado" | "entregue";
export type KCols = Record<ColKey, KCard[]>;

export type DashboardEntry = {
  id: number;
  data: string; // YYYY-MM-DD
  descricao: string;
  receita: number;
  pedidos: number;
  pagamento: "pix" | "cartao" | "boleto";
  status_pedido: "aguardando" | "producao" | "finalizado" | "entregue" | "cancelado";
  product_id?: number | null;
  produto_nome?: string | null;
  quantidade_pecas?: number;
  created_at?: string;
};

export type SystemUser = {
  id: number;
  nome: string;
  email: string;
  cargo: string;
  status: string;
  ultimo?: string;
};

export type ActivityItem = {
  id: number;
  user: string;
  action: string;
  time: string;
  date: string;
  type: "create" | "update" | "stock" | "system";
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function cn(...cls: (string | boolean | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatCurrentDatePtBr(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function formatIsoToBr(iso?: string): string {
  if (!iso) return "—";
  if (iso.includes("/")) return iso;
  const parts = iso.slice(0, 10).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function computeProductStatus(estoque: number, min = 10): string {
  if (estoque <= 0) return "Sem Estoque";
  if (estoque <= min) return "Crítico";
  return "Ativo";
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    toast.error("Não há dados para exportar");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// LocalStorage helpers for offline/fallback resilience (starts completely empty)
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

// ─── Base Components ──────────────────────────────────────────────────────────
function Btn({
  children, variant = "primary", size = "md", onClick, disabled, className = "", type = "button", full, title,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  full?: boolean;
  title?: string;
}) {
  const v = {
    primary: "bg-[#c11720] hover:bg-[#a0131a] text-white shadow-sm shadow-[#c11720]/20",
    secondary: "bg-[#0b3048] hover:bg-[#0d3d5c] text-white border border-[#679bbc]/25",
    ghost: "bg-transparent hover:bg-[#679bbc]/10 text-[#679bbc]",
    danger: "bg-[#c11720]/10 hover:bg-[#c11720]/20 text-[#c11720] border border-[#c11720]/30",
    outline: "bg-transparent border border-[#679bbc]/30 text-[#e8f0f7] hover:border-[#679bbc]/60 hover:bg-[#679bbc]/5",
  }[variant];
  const s = {
    sm: "px-3 py-1.5 text-xs rounded-md gap-1.5",
    md: "px-4 py-2 text-sm rounded-lg gap-2",
    lg: "px-6 py-3 text-base rounded-lg gap-2",
  }[size];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        v, s, full && "w-full justify-center", className
      )}
    >
      {children}
    </button>
  );
}

function Badge({ children, variant = "default" }: {
  children: ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "default" | "muted";
}) {
  const v = {
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
    warning: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
    danger: "bg-[#c11720]/15 text-[#c11720] border border-[#c11720]/20",
    info: "bg-[#679bbc]/15 text-[#679bbc] border border-[#679bbc]/20",
    default: "bg-[#0b3048] text-[#e8f0f7] border border-[#679bbc]/20",
    muted: "bg-[#132a3e] text-[#8fafc5] border border-[#679bbc]/10",
  }[variant];
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide", v)}>
      {children}
    </span>
  );
}

function Field({
  label, placeholder, value, onChange, type = "text", icon, className = "", min, step,
}: {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  type?: string;
  icon?: ReactNode;
  className?: string;
  min?: string;
  step?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-[10px] font-semibold text-[#8fafc5] uppercase tracking-widest">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#679bbc]/50">{icon}</div>
        )}
        <input
          type={type}
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg text-sm text-[#e8f0f7]",
            "placeholder-[#8fafc5]/40 transition-all focus:outline-none focus:border-[#679bbc]/60 focus:ring-1 focus:ring-[#679bbc]/20",
            icon ? "pl-9 pr-3 py-2.5" : "px-3 py-2.5"
          )}
        />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtitle, up = true }: {
  icon: ReactNode; label: string; value: string; subtitle: string; up?: boolean;
}) {
  return (
    <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[#8fafc5] uppercase tracking-widest">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-[#0b3048] flex items-center justify-center text-[#679bbc]">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-[#e8f0f7] font-mono truncate">{value}</div>
      <div className={cn("flex items-center gap-1 text-xs font-medium", up ? "text-emerald-400" : "text-amber-400")}>
        {up ? <TrendingUp size={12} /> : <AlertTriangle size={12} />}
        <span className="truncate">{subtitle}</span>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-[24px] sm:text-[26px] font-bold text-[#e8f0f7] leading-tight" style={DISPLAY}>{title}</h1>
        {subtitle && <p className="text-sm text-[#8fafc5] mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

function TabStrip({ tabs, active, onChange }: {
  tabs: string[]; active: string; onChange: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0.5 bg-[#0b3048]/50 p-1 rounded-lg w-fit mb-6">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize cursor-pointer",
            active === t ? "bg-[#c11720] text-white" : "text-[#8fafc5] hover:text-[#e8f0f7]"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0c1d2e] border border-[#679bbc]/20 rounded-lg px-4 py-3 text-xs shadow-2xl">
      <div className="text-[#8fafc5] mb-2 font-semibold">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[#e8f0f7] capitalize">{p.name}:</span>
          <span className="text-[#679bbc] font-bold">
            {p.name.toLowerCase() === "receita" ? fmt(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "produtos", icon: Package, label: "Produtos" },
  { id: "dtf", icon: ImageIcon, label: "Banco DTF" },
  { id: "pedido", icon: ShoppingCart, label: "Criar Pedido" },
  { id: "kanban", icon: Layers, label: "Produção" },
  { id: "estoque", icon: Box, label: "Estoque" },
  { id: "relatorios", icon: BarChart2, label: "Relatórios" },
  { id: "admin", icon: Shield, label: "Admin" },
];

function Sidebar({
  active,
  onNav,
  onLogout,
  currentUser,
  mobileOpen,
  onCloseMobile,
}: {
  active: string;
  onNav: (id: string) => void;
  onLogout: () => void;
  currentUser: SystemUser;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const content = (
    <aside className="w-56 h-full bg-[#0b3048] border-r border-[#679bbc]/15 flex flex-col flex-shrink-0">
      <div className="px-5 py-4 border-b border-[#679bbc]/12 flex items-center justify-between">
        <div>
          <img
            src={lambLogo}
            alt="Lamb Store"
            className="w-28 h-auto object-contain"
          />
          <div className="text-[9px] text-[#679bbc]/50 uppercase tracking-[0.15em] mt-1.5">DTF Manager</div>
        </div>
        <button
          onClick={onCloseMobile}
          className="lg:hidden text-[#8fafc5] hover:text-white p-1"
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onNav(item.id);
              onCloseMobile();
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer",
              active === item.id
                ? "bg-[#c11720] text-white shadow-md shadow-[#c11720]/25"
                : "text-[#8fafc5] hover:text-[#e8f0f7] hover:bg-[#679bbc]/10"
            )}
          >
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="px-2 py-4 border-t border-[#679bbc]/12">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-[#679bbc]/20 flex items-center justify-center flex-shrink-0">
            <User size={13} className="text-[#679bbc]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#e8f0f7] truncate">{currentUser.nome}</div>
            <div className="text-[10px] text-[#679bbc]/60">{currentUser.cargo}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[#8fafc5] hover:text-[#c11720] hover:bg-[#c11720]/8 transition-all cursor-pointer"
        >
          <LogOut size={13} />
          Sair do sistema
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block h-full">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────
function TopBar({
  onNav,
  onOpenMobile,
  criticalCount,
  globalSearch,
  onGlobalSearch,
}: {
  onNav: (id: string) => void;
  onOpenMobile: () => void;
  criticalCount: number;
  globalSearch: string;
  onGlobalSearch: (q: string) => void;
}) {
  return (
    <header className="h-14 bg-[#0c1d2e]/90 border-b border-[#679bbc]/15 flex items-center px-4 sm:px-6 gap-3 flex-shrink-0 backdrop-blur-sm">
      <button
        onClick={onOpenMobile}
        className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[#8fafc5] hover:text-white hover:bg-[#679bbc]/10"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>
      <div className="relative max-w-xs w-full">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#679bbc]/40" />
        <input
          value={globalSearch}
          onChange={(e) => onGlobalSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && globalSearch.trim()) {
              onNav("produtos");
            }
          }}
          placeholder="Buscar produtos, pedidos, SKU..."
          className="w-full bg-[#0b3048]/60 border border-[#679bbc]/15 rounded-lg pl-8 pr-3 py-2 text-xs text-[#e8f0f7] placeholder-[#8fafc5]/35 focus:outline-none focus:border-[#679bbc]/40"
        />
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={() => {
            if (criticalCount > 0) {
              toast.warning(`${criticalCount} item(ns) em estoque crítico`);
            } else {
              toast.success("Nenhuma pendência de estoque crítico no momento");
            }
          }}
          className="relative w-8 h-8 rounded-lg flex items-center justify-center text-[#8fafc5] hover:text-[#e8f0f7] hover:bg-[#679bbc]/10 transition-all cursor-pointer"
        >
          <Bell size={15} />
          {criticalCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#c11720] rounded-full" />
          )}
        </button>
        <button
          onClick={() => onNav("admin")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8fafc5] hover:text-[#e8f0f7] hover:bg-[#679bbc]/10 transition-all cursor-pointer"
        >
          <Settings size={15} />
        </button>
        <div className="w-8 h-8 rounded-full bg-[#679bbc]/20 flex items-center justify-center border border-[#679bbc]/30">
          <User size={14} className="text-[#679bbc]" />
        </div>
      </div>
    </header>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function AuthScreen({
  onLogin,
  totalStock,
  totalOrders,
  totalDesigns,
  currentMonthRevenue,
}: {
  onLogin: (user: SystemUser) => void;
  totalStock: number;
  totalOrders: number;
  totalDesigns: number;
  currentMonthRevenue: number;
}) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  async function doLogin() {
    if (!email.trim() || !pass.trim()) {
      toast.error("Informe seu e-mail e senha");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      if (response.ok) {
        const body = await response.json();
        setApiToken(body.token);
        onLogin(body.user);
        return;
      }
      const errBody = await response.json().catch(() => null);
      throw new Error(errBody?.error || "E-mail ou senha inválidos");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[#070e17]">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-[46%] bg-[#0b3048] flex-col justify-between p-12 relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 15% 85%, rgba(193,23,32,0.18) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(103,155,188,0.18) 0%, transparent 55%)",
          }}
        />
        <div className="relative z-10">
          <div className="mb-10">
            <img
              src={lambLogo}
              alt="Lamb Store"
              className="w-48 h-auto object-contain drop-shadow-2xl"
            />
          </div>
          <h2 className="text-[38px] font-bold text-white leading-[1.15] mb-5" style={DISPLAY}>
            Gestão completa para sua produção de camisetas DTF.
          </h2>
          <p className="text-[#679bbc] text-[15px] leading-relaxed">
            Controle estoque, gerencie pedidos, organize sua produção e acesse o banco de designs — tudo em um único sistema integrado.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-2 gap-3">
          {[
            { icon: <Package size={15} />, label: "Estoque", value: `${totalStock} peças` },
            { icon: <ShoppingCart size={15} />, label: "Pedidos ativos", value: `${totalOrders} pedidos` },
            { icon: <ImageIcon size={15} />, label: "Designs DTF", value: `${totalDesigns} arquivos` },
            { icon: <DollarSign size={15} />, label: "Receita / mês", value: fmt(currentMonthRevenue) },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
              <div className="text-[#679bbc] mb-2">{item.icon}</div>
              <div className="text-[#8fafc5] text-[10px] mb-0.5">{item.label}</div>
              <div className="text-white font-bold text-[13px]">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right auth panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[360px]">
          {mode === "login" ? (
            <>
              <div className="mb-8">
                <h1 className="text-[28px] font-bold text-[#e8f0f7] mb-2" style={DISPLAY}>Bem-vindo de volta</h1>
                <p className="text-[#8fafc5] text-sm">Entre com suas credenciais para acessar o sistema</p>
              </div>
              <div className="space-y-4">
                <Field label="E-mail" type="email" value={email} onChange={setEmail} icon={<Mail size={13} />} placeholder="seu@email.com" />
                <Field label="Senha" type="password" value={pass} onChange={setPass} icon={<Lock size={13} />} placeholder="••••••••" />
                <div className="flex justify-end items-center text-xs">
                  <button onClick={() => setMode("forgot")} className="text-[#679bbc] hover:text-[#e8f0f7] transition-colors cursor-pointer">
                    Esqueci minha senha
                  </button>
                </div>
                <Btn variant="primary" size="lg" full onClick={doLogin} disabled={loading}>
                  {loading ? <><RefreshCw size={14} className="animate-spin" /> Entrando...</> : "Entrar no sistema"}
                </Btn>
              </div>
              <div className="mt-8 pt-6 border-t border-[#679bbc]/10 text-center">
                <p className="text-[10px] text-[#8fafc5]/40">Lamb Store DTF Manager — © {new Date().getFullYear()}</p>
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setMode("login")} className="flex items-center gap-1.5 text-[#679bbc] text-sm mb-6 hover:text-[#e8f0f7] transition-colors cursor-pointer">
                <ArrowLeft size={13} /> Voltar ao login
              </button>
              <div className="mb-8">
                <h1 className="text-[28px] font-bold text-[#e8f0f7] mb-2" style={DISPLAY}>Recuperar senha</h1>
                <p className="text-[#8fafc5] text-sm">Informe seu e-mail para receber o link de redefinição</p>
              </div>
              <div className="space-y-4">
                <Field label="E-mail cadastrado" type="email" value={email} onChange={setEmail} icon={<Mail size={13} />} />
                <Btn variant="primary" size="lg" full onClick={() => { toast.success("Link enviado para " + email); setMode("login"); }}>
                  Enviar link de redefinição
                </Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardScreen({
  products,
  dtfDesigns,
  orders,
  entries,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onQuickRestockProduct,
  onQuickRestockDTF,
  onNav,
}: {
  products: Product[];
  dtfDesigns: DTFDesign[];
  orders: KCard[];
  entries: DashboardEntry[];
  onAddEntry: (entry: Omit<DashboardEntry, "id">) => Promise<void>;
  onUpdateEntry: (id: number, entry: Omit<DashboardEntry, "id">) => Promise<void>;
  onDeleteEntry: (id: number) => Promise<void>;
  onQuickRestockProduct: (id: number, addQty: number) => Promise<void>;
  onQuickRestockDTF: (id: number, newQty: number) => Promise<void>;
  onNav: (screen: string) => void;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0..11

  // Filter states for Annual Revenue Chart based on current date
  const [filterMode, setFilterMode] = useState<"ano" | "mes">("ano");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);

  // Critical stock pagination & filter state
  const [criticalFilter, setCriticalFilter] = useState<"todos" | "produtos" | "dtf">("todos");
  const [criticalPage, setCriticalPage] = useState<number>(1);
  const [criticalPageSize, setCriticalPageSize] = useState<number>(4);

  // Manual Dashboard Entry modal state
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [modalTab, setModalTab] = useState<"form" | "historico">("form");
  const [editingEntry, setEditingEntry] = useState<DashboardEntry | null>(null);
  const [entryForm, setEntryForm] = useState({
    data: getTodayIso(),
    descricao: "",
    receita: "",
    pedidos: "1",
    pagamento: "pix" as "pix" | "cartao" | "boleto",
    status_pedido: "entregue" as DashboardEntry["status_pedido"],
    product_id: "",
    quantidade_pecas: "1",
  });
  const [savingEntry, setSavingEntry] = useState(false);

  // Available years based on currentYear + any year in entries/orders
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([
      currentYear - 2,
      currentYear - 1,
      currentYear,
      currentYear + 1,
    ]);
    entries.forEach((e) => {
      const y = Number(e.data?.slice(0, 4));
      if (y > 2000 && y < 2100) yearsSet.add(y);
    });
    orders.forEach((o) => {
      const dateStr = o.created_at || o.prazo_iso;
      if (dateStr) {
        const y = Number(String(dateStr).slice(0, 4));
        if (y > 2000 && y < 2100) yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [entries, orders, currentYear]);

  // Unified financial records combining manual dashboard entries + orders
  const unifiedRecords = useMemo(() => {
    const fromEntries = entries.map((e) => ({
      source: "manual" as const,
      id: `entry-${e.id}`,
      rawId: e.id,
      dateIso: (e.data || getTodayIso()).slice(0, 10),
      receita: Number(e.receita) || 0,
      pedidos: Number(e.pedidos) || 0,
      pagamento: (e.pagamento || "pix").toLowerCase(),
      status: e.status_pedido || "entregue",
      productId: e.product_id ? Number(e.product_id) : null,
      productName: e.produto_nome || null,
      pecas: Number(e.quantidade_pecas ?? 1),
      descricao: e.descricao,
    }));

    const fromOrders = orders.map((o) => {
      const createdIso = o.created_at
        ? new Date(o.created_at).toISOString().slice(0, 10)
        : o.prazo_iso || getTodayIso();
      return {
        source: "order" as const,
        id: `order-${o.id}`,
        rawId: Number(o.id),
        dateIso: createdIso,
        receita: Number(o.valor_total || 0),
        pedidos: 1,
        pagamento: (o.pagamento || "pix").toLowerCase(),
        status: o.status || "aguardando",
        productId: o.product_id ? Number(o.product_id) : null,
        productName: o.produto || null,
        pecas: Number(o.qtd || 1),
        descricao: `Pedido - ${o.cliente}`,
      };
    });

    return [...fromEntries, ...fromOrders];
  }, [entries, orders]);

  // Records filtered by selected Year (and Month if filterMode === 'mes')
  const periodRecords = useMemo(() => {
    return unifiedRecords.filter((r) => {
      const [yStr, mStr] = r.dateIso.split("-");
      const y = Number(yStr);
      const m = Number(mStr) - 1;
      if (y !== selectedYear) return false;
      if (filterMode === "mes" && m !== selectedMonth) return false;
      return true;
    });
  }, [unifiedRecords, selectedYear, selectedMonth, filterMode]);

  // Chart data:
  // If filterMode === 'ano': 12 months (Jan..Dez) of selectedYear
  // If filterMode === 'mes': All days (01..lastDay) of selectedMonth in selectedYear
  const chartData = useMemo(() => {
    if (filterMode === "ano") {
      return MONTHS_SHORT.map((mesLabel, monthIdx) => {
        const monthRecs = unifiedRecords.filter((r) => {
          const [yStr, mStr] = r.dateIso.split("-");
          return Number(yStr) === selectedYear && Number(mStr) - 1 === monthIdx;
        });
        return {
          label: mesLabel,
          receita: monthRecs.reduce((sum, r) => sum + r.receita, 0),
          pedidos: monthRecs.reduce((sum, r) => sum + r.pedidos, 0),
        };
      });
    } else {
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const monthPadded = String(selectedMonth + 1).padStart(2, "0");
      return Array.from({ length: daysInMonth }, (_, i) => {
        const dayNum = i + 1;
        const dayPadded = String(dayNum).padStart(2, "0");
        const targetIso = `${selectedYear}-${monthPadded}-${dayPadded}`;
        const dayRecs = unifiedRecords.filter((r) => r.dateIso === targetIso);
        return {
          label: `${dayPadded}/${monthPadded}`,
          receita: dayRecs.reduce((sum, r) => sum + r.receita, 0),
          pedidos: dayRecs.reduce((sum, r) => sum + r.pedidos, 0),
        };
      });
    }
  }, [unifiedRecords, filterMode, selectedYear, selectedMonth]);

  // KPI Metrics
  const totalPeriodRevenue = useMemo(
    () => periodRecords.reduce((sum, r) => sum + r.receita, 0),
    [periodRecords]
  );
  const totalPeriodOrders = useMemo(
    () => periodRecords.reduce((sum, r) => sum + r.pedidos, 0),
    [periodRecords]
  );
  const totalStockPieces = useMemo(
    () => products.reduce((sum, p) => sum + Number(p.estoque || 0), 0),
    [products]
  );

  // Critical stock items (Products + DTF Designs)
  const criticalProducts = useMemo(
    () =>
      products
        .filter((p) => Number(p.estoque) <= Number(p.estoque_minimo ?? 10))
        .map((p) => ({
          uid: `prod-${p.id}`,
          id: p.id,
          kind: "produto" as const,
          nome: p.nome,
          sub: `SKU: ${p.sku} · ${p.categoria}`,
          estoque: Number(p.estoque),
          minimo: Number(p.estoque_minimo ?? 10),
        })),
    [products]
  );

  const criticalDTFs = useMemo(
    () =>
      dtfDesigns
        .filter((d) => Number(d.estoque) <= 10)
        .map((d) => ({
          uid: `dtf-${d.id}`,
          id: d.id,
          kind: "dtf" as const,
          nome: d.nome,
          sub: `DTF · ${d.cat} · ${d.tam}`,
          estoque: Number(d.estoque),
          minimo: 10,
        })),
    [dtfDesigns]
  );

  const filteredCriticalItems = useMemo(() => {
    if (criticalFilter === "produtos") return criticalProducts;
    if (criticalFilter === "dtf") return criticalDTFs;
    return [...criticalProducts, ...criticalDTFs];
  }, [criticalFilter, criticalProducts, criticalDTFs]);

  const totalCriticalCount = criticalProducts.length + criticalDTFs.length;
  const totalCriticalPages = Math.max(1, Math.ceil(filteredCriticalItems.length / criticalPageSize));

  useEffect(() => {
    if (criticalPage > totalCriticalPages) {
      setCriticalPage(totalCriticalPages);
    }
  }, [criticalPage, totalCriticalPages]);

  const paginatedCriticalItems = useMemo(() => {
    const start = (criticalPage - 1) * criticalPageSize;
    return filteredCriticalItems.slice(start, start + criticalPageSize);
  }, [filteredCriticalItems, criticalPage, criticalPageSize]);

  // Order Status distribution
  const orderStatusData = useMemo(() => {
    const counts = {
      aguardando: 0,
      producao: 0,
      finalizado: 0,
      entregue: 0,
      cancelado: 0,
    };
    periodRecords.forEach((r) => {
      const st = (r.status || "aguardando").toLowerCase() as keyof typeof counts;
      if (st in counts) counts[st] += r.pedidos || 1;
    });
    return [
      { name: "Aguardando", qtd: counts.aguardando },
      { name: "Produção", qtd: counts.producao },
      { name: "Finalizado", qtd: counts.finalizado },
      { name: "Entregue", qtd: counts.entregue },
      { name: "Cancelado", qtd: counts.cancelado },
    ];
  }, [periodRecords]);

  // Payment Method Breakdown
  const paymentMethodData = useMemo(() => {
    const totals = {
      pix: { vendas: 0, receita: 0 },
      cartao: { vendas: 0, receita: 0 },
      boleto: { vendas: 0, receita: 0 },
    };
    periodRecords.forEach((r) => {
      const key = (r.pagamento === "cartao" || r.pagamento === "boleto" ? r.pagamento : "pix") as keyof typeof totals;
      totals[key].vendas += r.pedidos || 1;
      totals[key].receita += r.receita || 0;
    });
    const totalVendas = totals.pix.vendas + totals.cartao.vendas + totals.boleto.vendas;
    return [
      {
        method: "PIX",
        id: "pix",
        vendas: totals.pix.vendas,
        receita: totals.pix.receita,
        pct: totalVendas > 0 ? Math.round((totals.pix.vendas / totalVendas) * 100) : 0,
        color: "#10b981",
      },
      {
        method: "Cartão",
        id: "cartao",
        vendas: totals.cartao.vendas,
        receita: totals.cartao.receita,
        pct: totalVendas > 0 ? Math.round((totals.cartao.vendas / totalVendas) * 100) : 0,
        color: "#679bbc",
      },
      {
        method: "Boleto",
        id: "boleto",
        vendas: totals.boleto.vendas,
        receita: totals.boleto.receita,
        pct: totalVendas > 0 ? Math.round((totals.boleto.vendas / totalVendas) * 100) : 0,
        color: "#f59e0b",
      },
    ];
  }, [periodRecords]);

  // Top Products computed from real products + period records
  const topProdsData = useMemo(() => {
    return products
      .map((p) => {
        const matching = periodRecords.filter(
          (r) => r.productId === p.id || (r.productName && r.productName.toLowerCase() === p.nome.toLowerCase())
        );
        const vendas = matching.reduce((sum, r) => sum + (r.pecas || r.pedidos || 0), 0);
        const receita = matching.reduce((sum, r) => sum + r.receita, 0);
        return {
          id: p.id,
          nome: p.nome,
          sku: p.sku,
          vendas,
          receita,
          estoque: p.estoque,
          minimo: p.estoque_minimo ?? 10,
        };
      })
      .sort((a, b) => b.receita - a.receita || b.vendas - a.vendas)
      .slice(0, 5);
  }, [products, periodRecords]);

  function openNewEntryModal() {
    setEditingEntry(null);
    setEntryForm({
      data: getTodayIso(),
      descricao: "",
      receita: "",
      pedidos: "1",
      pagamento: "pix",
      status_pedido: "entregue",
      product_id: "",
      quantidade_pecas: "1",
    });
    setModalTab("form");
    setShowEntryModal(true);
  }

  function openEditEntry(entry: DashboardEntry) {
    setEditingEntry(entry);
    setEntryForm({
      data: (entry.data || getTodayIso()).slice(0, 10),
      descricao: entry.descricao || "",
      receita: String(entry.receita ?? ""),
      pedidos: String(entry.pedidos ?? 1),
      pagamento: entry.pagamento || "pix",
      status_pedido: entry.status_pedido || "entregue",
      product_id: entry.product_id ? String(entry.product_id) : "",
      quantidade_pecas: String(entry.quantidade_pecas ?? 1),
    });
    setModalTab("form");
    setShowEntryModal(true);
  }

  async function handleSaveEntry() {
    const valor = parseFloat(entryForm.receita);
    if (isNaN(valor) || valor < 0) {
      toast.error("Informe um valor de receita válido");
      return;
    }
    if (!entryForm.data) {
      toast.error("Informe a data do lançamento");
      return;
    }

    setSavingEntry(true);
    try {
      const linkedProd = products.find((p) => String(p.id) === entryForm.product_id);
      const payload: Omit<DashboardEntry, "id"> = {
        data: entryForm.data,
        descricao: entryForm.descricao.trim() || "Lançamento Manual",
        receita: valor,
        pedidos: Math.max(0, parseInt(entryForm.pedidos) || 1),
        pagamento: entryForm.pagamento,
        status_pedido: entryForm.status_pedido,
        product_id: linkedProd ? linkedProd.id : null,
        produto_nome: linkedProd ? linkedProd.nome : null,
        quantidade_pecas: Math.max(1, parseInt(entryForm.quantidade_pecas) || 1),
      };

      if (editingEntry) {
        await onUpdateEntry(editingEntry.id, payload);
        toast.success("Lançamento atualizado no Dashboard!");
      } else {
        await onAddEntry(payload);
        toast.success("Valor lançado no Dashboard com sucesso!");
      }
      setEditingEntry(null);
      setEntryForm({
        data: getTodayIso(),
        descricao: "",
        receita: "",
        pedidos: "1",
        pagamento: "pix",
        status_pedido: "entregue",
        product_id: "",
        quantidade_pecas: "1",
      });
    } finally {
      setSavingEntry(false);
    }
  }

  const periodSubtitle =
    filterMode === "ano"
      ? `Ano de ${selectedYear}`
      : `${MONTHS_FULL[selectedMonth]} de ${selectedYear}`;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header without Exportar and Atualizar buttons; dynamic current date */}
      <PageHeader
        title="Dashboard"
        subtitle={`Visão geral do sistema — ${formatCurrentDatePtBr()}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" size="sm" onClick={() => { setModalTab("historico"); setShowEntryModal(true); }}>
              <FileText size={12} /> Lançamentos ({entries.length})
            </Btn>
            <Btn variant="primary" size="sm" onClick={openNewEntryModal}>
              <Plus size={12} /> Lançar Valores
            </Btn>
          </div>
        }
      />

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign size={15} />}
          label={`Receita (${filterMode === "ano" ? selectedYear : MONTHS_SHORT[selectedMonth]})`}
          value={fmt(totalPeriodRevenue)}
          subtitle={`${periodRecords.length} registro(s) no período`}
          up={totalPeriodRevenue > 0}
        />
        <StatCard
          icon={<ShoppingCart size={15} />}
          label="Pedidos no Período"
          value={String(totalPeriodOrders)}
          subtitle={periodSubtitle}
          up={totalPeriodOrders > 0}
        />
        <StatCard
          icon={<Box size={15} />}
          label="Peças em Estoque"
          value={String(totalStockPieces)}
          subtitle={`${products.length} produto(s) cadastrado(s)`}
          up={totalStockPieces > 0}
        />
        <StatCard
          icon={<AlertTriangle size={15} />}
          label="Itens Críticos"
          value={String(totalCriticalCount)}
          subtitle={`${criticalProducts.length} prod. · ${criticalDTFs.length} DTF`}
          up={totalCriticalCount === 0}
        />
      </div>

      {/* Stacked Responsive Section: 1. Receita Anual Chart on Top, 2. Estoque Crítico Below with Pagination */}
      <div className="space-y-5">
        {/* Gráfico de Receita Anual com filtros de Ano ou Mês baseados na data atual */}
        <div className="w-full bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm font-semibold text-[#e8f0f7]">Receita Anual</h3>
                <Badge variant="info">{periodSubtitle}</Badge>
                <span className="text-xs font-mono text-emerald-400 font-semibold">
                  Total: {fmt(totalPeriodRevenue)}
                </span>
              </div>
              <p className="text-[11px] text-[#8fafc5] mt-1">
                {filterMode === "ano"
                  ? `Evolução mensal de Janeiro a Dezembro de ${selectedYear} (baseado na data atual)`
                  : `Evolução diária em ${MONTHS_FULL[selectedMonth]} de ${selectedYear} (baseado na data atual)`}
              </p>
            </div>

            {/* Filtros de Ano e Mês */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-[#0b3048]/70 p-1 rounded-lg border border-[#679bbc]/15">
                <button
                  type="button"
                  onClick={() => setFilterMode("ano")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                    filterMode === "ano" ? "bg-[#c11720] text-white" : "text-[#8fafc5] hover:text-[#e8f0f7]"
                  )}
                >
                  Filtro: Ano
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("mes")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                    filterMode === "mes" ? "bg-[#c11720] text-white" : "text-[#8fafc5] hover:text-[#e8f0f7]"
                  )}
                >
                  Filtro: Mês
                </button>
              </div>

              {/* Seletor de Ano */}
              <div className="flex items-center gap-1.5 bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-2.5 py-1.5">
                <Calendar size={12} className="text-[#679bbc]" />
                <label className="text-[10px] text-[#8fafc5] uppercase font-semibold">Ano:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent text-xs text-[#e8f0f7] font-semibold focus:outline-none cursor-pointer"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y} className="bg-[#0c1d2e] text-[#e8f0f7]">
                      {y} {y === currentYear ? "(Atual)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seletor de Mês */}
              <div className="flex items-center gap-1.5 bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-2.5 py-1.5">
                <label className="text-[10px] text-[#8fafc5] uppercase font-semibold">Mês:</label>
                <select
                  value={filterMode === "ano" ? "todos" : String(selectedMonth)}
                  onChange={(e) => {
                    if (e.target.value === "todos") {
                      setFilterMode("ano");
                    } else {
                      setFilterMode("mes");
                      setSelectedMonth(Number(e.target.value));
                    }
                  }}
                  className="bg-transparent text-xs text-[#e8f0f7] font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="todos" className="bg-[#0c1d2e] text-[#e8f0f7]">
                    Todos os meses ({selectedYear})
                  </option>
                  {MONTHS_FULL.map((mName, idx) => (
                    <option key={mName} value={idx} className="bg-[#0c1d2e] text-[#e8f0f7]">
                      {mName} {idx === currentMonth && selectedYear === currentYear ? "(Atual)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {(selectedYear !== currentYear || (filterMode === "mes" && selectedMonth !== currentMonth)) && (
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedYear(currentYear);
                    setSelectedMonth(currentMonth);
                  }}
                >
                  Hoje
                </Btn>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(103,155,188,0.08)" />
              <XAxis dataKey="label" tick={{ fill: "#8fafc5", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: "#8fafc5", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${v}`)}
              />
              <Tooltip content={<ChartTip />} />
              <Area
                type="monotone"
                dataKey="receita"
                name="receita"
                stroke="#679bbc"
                strokeWidth={2.5}
                fill="#679bbc"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Estoque Crítico posicionado EMBAIXO do gráfico de receita anual e com Paginação */}
        <div className="w-full bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm font-semibold text-[#e8f0f7]">Estoque Crítico</h3>
              <Badge variant={totalCriticalCount > 0 ? "danger" : "success"}>
                {totalCriticalCount} {totalCriticalCount === 1 ? "item" : "itens"}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro de tipo */}
              <div className="flex bg-[#0b3048]/60 p-1 rounded-lg border border-[#679bbc]/15">
                {(
                  [
                    { id: "todos", label: `Todos (${totalCriticalCount})` },
                    { id: "produtos", label: `Camisetas (${criticalProducts.length})` },
                    { id: "dtf", label: `Designs DTF (${criticalDTFs.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setCriticalFilter(tab.id);
                      setCriticalPage(1);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer",
                      criticalFilter === tab.id
                        ? "bg-[#c11720] text-white"
                        : "text-[#8fafc5] hover:text-[#e8f0f7]"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Seletor de itens por página */}
              <div className="flex items-center gap-1.5 bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-2.5 py-1 text-[11px] text-[#8fafc5]">
                <span>Por página:</span>
                <select
                  value={criticalPageSize}
                  onChange={(e) => {
                    setCriticalPageSize(Number(e.target.value));
                    setCriticalPage(1);
                  }}
                  className="bg-transparent text-[#e8f0f7] font-semibold focus:outline-none cursor-pointer"
                >
                  <option value={4} className="bg-[#0c1d2e]">4</option>
                  <option value={6} className="bg-[#0c1d2e]">6</option>
                  <option value={8} className="bg-[#0c1d2e]">8</option>
                </select>
              </div>
            </div>
          </div>

          {filteredCriticalItems.length === 0 ? (
            <div className="py-8 px-4 text-center border border-dashed border-[#679bbc]/15 rounded-xl bg-[#0b3048]/15">
              <CheckCircle size={22} className="text-emerald-400 mx-auto mb-2 opacity-80" />
              <div className="text-xs font-semibold text-[#e8f0f7]">
                Nenhum item em estoque crítico nesta categoria
              </div>
              <p className="text-[11px] text-[#8fafc5] mt-1">
                Produtos com estoque igual ou abaixo do mínimo configurado aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {paginatedCriticalItems.map((item) => {
                const isZero = item.estoque <= 0;
                const pct = Math.min(100, Math.round((item.estoque / Math.max(1, item.minimo)) * 100));
                return (
                  <div
                    key={item.uid}
                    className={cn(
                      "p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition-all",
                      isZero
                        ? "bg-[#c11720]/8 border-[#c11720]/25"
                        : "bg-amber-500/8 border-amber-500/20"
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#e8f0f7] leading-snug">{item.nome}</span>
                        <Badge variant={isZero ? "danger" : "warning"}>
                          {isZero ? "Esgotado" : `${item.estoque} un.`}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-[#8fafc5] mb-2">{item.sub}</div>
                      <div className="h-1.5 bg-[#0b3048] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: isZero ? "#c11720" : "#f59e0b",
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#679bbc]/10">
                      <span className="text-[10px] text-[#8fafc5]">Mín: {item.minimo} un.</span>
                      <button
                        type="button"
                        onClick={() => {
                          const addAmount = Math.max(10, item.minimo - item.estoque + 5);
                          if (item.kind === "produto") {
                            onQuickRestockProduct(item.id, addAmount);
                          } else {
                            onQuickRestockDTF(item.id, item.estoque + addAmount);
                          }
                        }}
                        className="text-[10px] font-semibold text-[#679bbc] hover:text-[#e8f0f7] flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={10} /> Repor estoque
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paginação da seção Estoque Crítico */}
          <div className="mt-4 pt-3 border-t border-[#679bbc]/12 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-[11px] text-[#8fafc5]">
              {filteredCriticalItems.length === 0
                ? "Mostrando 0 de 0 itens — Página 1 de 1"
                : `Mostrando ${(criticalPage - 1) * criticalPageSize + 1}–${Math.min(
                    criticalPage * criticalPageSize,
                    filteredCriticalItems.length
                  )} de ${filteredCriticalItems.length} item(ns) — Página ${criticalPage} de ${totalCriticalPages}`}
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <Btn
                variant="outline"
                size="sm"
                disabled={criticalPage <= 1}
                onClick={() => setCriticalPage((p) => Math.max(1, p - 1))}
              >
                <ArrowLeft size={11} /> Anterior
              </Btn>

              {Array.from({ length: totalCriticalPages }, (_, idx) => idx + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCriticalPage(pageNum)}
                  className={cn(
                    "w-7 h-7 rounded-md text-xs font-semibold transition-all cursor-pointer",
                    criticalPage === pageNum
                      ? "bg-[#c11720] text-white"
                      : "bg-[#0b3048]/60 text-[#8fafc5] hover:text-[#e8f0f7] border border-[#679bbc]/15"
                  )}
                >
                  {pageNum}
                </button>
              ))}

              <Btn
                variant="outline"
                size="sm"
                disabled={criticalPage >= totalCriticalPages}
                onClick={() => setCriticalPage((p) => Math.min(totalCriticalPages, p + 1))}
              >
                Próxima <ArrowRight size={11} />
              </Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Pedidos por Status, Vendas por Pagamento, Top Produtos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Bar chart */}
        <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#e8f0f7]">Pedidos por Status</h3>
            <Badge variant="info">{filterMode === "ano" ? selectedYear : MONTHS_SHORT[selectedMonth]}</Badge>
          </div>
          <ResponsiveContainer width="100%" height={185}>
            <BarChart data={orderStatusData} layout="vertical" margin={{ top: 0, right: 15, bottom: 0, left: 0 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#8fafc5", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: "#8fafc5", fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="qtd" name="Pedidos" fill="#679bbc" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payment breakdown */}
        <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#e8f0f7]">Vendas por Pagamento</h3>
            <Badge variant="info">{filterMode === "ano" ? selectedYear : MONTHS_SHORT[selectedMonth]}</Badge>
          </div>
          <div className="space-y-4">
            {paymentMethodData.map((m) => (
              <div key={m.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-[#e8f0f7]">{m.method}</span>
                  <div className="text-right">
                    <span className="text-xs font-mono text-emerald-400">{fmt(m.receita)}</span>
                    <span className="text-[10px] text-[#8fafc5] ml-2">{m.vendas} vendas</span>
                  </div>
                </div>
                <div className="h-2 bg-[#0b3048] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${m.pct}%`, backgroundColor: m.color }}
                  />
                </div>
                <div className="text-[10px] text-[#8fafc5] mt-1">{m.pct}% das vendas</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="lg:col-span-2 bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#e8f0f7]">Top Produtos</h3>
            <Btn variant="ghost" size="sm" onClick={() => onNav("produtos")}>
              Gerenciar Produtos <ArrowRight size={11} />
            </Btn>
          </div>
          {topProdsData.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8fafc5]">
              Nenhum produto cadastrado. Vá em <strong className="text-[#e8f0f7]">Produtos</strong> para inserir seus produtos manualmente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#8fafc5] border-b border-[#679bbc]/10">
                    <th className="pb-2.5 text-left font-medium">Produto</th>
                    <th className="pb-2.5 text-right font-medium">Vendas</th>
                    <th className="pb-2.5 text-right font-medium">Receita</th>
                    <th className="pb-2.5 text-right font-medium">Estoque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#679bbc]/8">
                  {topProdsData.map((p, i) => (
                    <tr key={p.sku} className="hover:bg-[#679bbc]/5 transition-colors">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-[#0b3048] text-[#679bbc] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </span>
                          <div>
                            <div className="text-[#e8f0f7] font-medium truncate max-w-[180px]">{p.nome}</div>
                            <div className="text-[#8fafc5]/60 font-mono text-[10px]">{p.sku}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-[#e8f0f7]">{p.vendas}</td>
                      <td className="py-2.5 text-right font-mono text-emerald-400">{fmt(p.receita)}</td>
                      <td className="py-2.5 text-right">
                        <Badge variant={p.estoque <= 0 ? "danger" : p.estoque <= p.minimo ? "warning" : "success"}>
                          {p.estoque}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal para Inserir / Gerenciar Valores Manualmente no Dashboard */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1d2e] border border-[#679bbc]/20 rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#e8f0f7]" style={DISPLAY}>
                {editingEntry ? "Editar Lançamento do Dashboard" : "Valores e Lançamentos do Dashboard"}
              </h2>
              <button
                onClick={() => {
                  setShowEntryModal(false);
                  setEditingEntry(null);
                }}
                className="text-[#8fafc5] hover:text-[#e8f0f7] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-1 bg-[#0b3048]/50 p-1 rounded-lg w-fit mb-5">
              <button
                type="button"
                onClick={() => setModalTab("form")}
                className={cn(
                  "px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                  modalTab === "form" ? "bg-[#c11720] text-white" : "text-[#8fafc5] hover:text-[#e8f0f7]"
                )}
              >
                {editingEntry ? "Editar Lançamento" : "+ Novo Lançamento"}
              </button>
              <button
                type="button"
                onClick={() => setModalTab("historico")}
                className={cn(
                  "px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                  modalTab === "historico" ? "bg-[#c11720] text-white" : "text-[#8fafc5] hover:text-[#e8f0f7]"
                )}
              >
                Histórico de Lançamentos ({entries.length})
              </button>
            </div>

            {modalTab === "form" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="Data do Lançamento *"
                    type="date"
                    value={entryForm.data}
                    onChange={(v) => setEntryForm({ ...entryForm, data: v })}
                  />
                  <Field
                    label="Valor da Receita (R$) *"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 1500.00"
                    value={entryForm.receita}
                    onChange={(v) => setEntryForm({ ...entryForm, receita: v })}
                  />
                </div>

                <Field
                  label="Descrição / Identificação"
                  placeholder="Ex: Vendas do dia, Pedido avulso, Fechamento..."
                  value={entryForm.descricao}
                  onChange={(v) => setEntryForm({ ...entryForm, descricao: v })}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field
                    label="Qtd. de Pedidos"
                    type="number"
                    min="0"
                    value={entryForm.pedidos}
                    onChange={(v) => setEntryForm({ ...entryForm, pedidos: v })}
                  />
                  <div>
                    <label className="text-[10px] font-semibold text-[#8fafc5] uppercase tracking-widest block mb-1.5">
                      Forma de Pagamento
                    </label>
                    <select
                      value={entryForm.pagamento}
                      onChange={(e) =>
                        setEntryForm({ ...entryForm, pagamento: e.target.value as DashboardEntry["pagamento"] })
                      }
                      className="w-full bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-3 py-2.5 text-sm text-[#e8f0f7]"
                    >
                      <option value="pix" className="bg-[#0c1d2e]">PIX</option>
                      <option value="cartao" className="bg-[#0c1d2e]">Cartão</option>
                      <option value="boleto" className="bg-[#0c1d2e]">Boleto</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[#8fafc5] uppercase tracking-widest block mb-1.5">
                      Status do Pedido
                    </label>
                    <select
                      value={entryForm.status_pedido}
                      onChange={(e) =>
                        setEntryForm({
                          ...entryForm,
                          status_pedido: e.target.value as DashboardEntry["status_pedido"],
                        })
                      }
                      className="w-full bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-3 py-2.5 text-sm text-[#e8f0f7]"
                    >
                      <option value="entregue" className="bg-[#0c1d2e]">Entregue</option>
                      <option value="finalizado" className="bg-[#0c1d2e]">Finalizado</option>
                      <option value="producao" className="bg-[#0c1d2e]">Em Produção</option>
                      <option value="aguardando" className="bg-[#0c1d2e]">Aguardando</option>
                      <option value="cancelado" className="bg-[#0c1d2e]">Cancelado</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-[#8fafc5] uppercase tracking-widest block mb-1.5">
                      Vincular a Produto (Opcional)
                    </label>
                    <select
                      value={entryForm.product_id}
                      onChange={(e) => setEntryForm({ ...entryForm, product_id: e.target.value })}
                      className="w-full bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-3 py-2.5 text-sm text-[#e8f0f7]"
                    >
                      <option value="" className="bg-[#0c1d2e]">Sem produto específico</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#0c1d2e]">
                          {p.nome} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field
                    label="Qtd. de Peças Vendidas"
                    type="number"
                    min="1"
                    value={entryForm.quantidade_pecas}
                    onChange={(v) => setEntryForm({ ...entryForm, quantidade_pecas: v })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#679bbc]/15">
                  <Btn
                    variant="ghost"
                    onClick={() => {
                      setShowEntryModal(false);
                      setEditingEntry(null);
                    }}
                  >
                    Fechar
                  </Btn>
                  <Btn variant="primary" onClick={handleSaveEntry} disabled={savingEntry}>
                    <Check size={13} />
                    {savingEntry ? "Salvando..." : editingEntry ? "Salvar Alterações" : "Inserir no Dashboard"}
                  </Btn>
                </div>
              </div>
            ) : (
              <div>
                {entries.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#8fafc5]">
                    Nenhum lançamento manual cadastrado ainda. Clique em <strong className="text-[#e8f0f7]">+ Novo Lançamento</strong> para adicionar valores.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#679bbc]/15 text-[#8fafc5]">
                          <th className="py-2.5 px-2 text-left">Data</th>
                          <th className="py-2.5 px-2 text-left">Descrição</th>
                          <th className="py-2.5 px-2 text-left">Pagto.</th>
                          <th className="py-2.5 px-2 text-right">Pedidos</th>
                          <th className="py-2.5 px-2 text-right">Receita</th>
                          <th className="py-2.5 px-2 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#679bbc]/10">
                        {entries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-[#679bbc]/5">
                            <td className="py-2.5 px-2 font-mono text-[#8fafc5]">{formatIsoToBr(entry.data)}</td>
                            <td className="py-2.5 px-2 text-[#e8f0f7]">
                              <div className="font-medium">{entry.descricao}</div>
                              {entry.produto_nome && (
                                <div className="text-[10px] text-[#679bbc]">{entry.produto_nome} ({entry.quantidade_pecas} un.)</div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 uppercase text-[#8fafc5]">{entry.pagamento}</td>
                            <td className="py-2.5 px-2 text-right font-mono text-[#e8f0f7]">{entry.pedidos}</td>
                            <td className="py-2.5 px-2 text-right font-mono text-emerald-400">{fmt(entry.receita)}</td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditEntry(entry)}
                                  className="w-6 h-6 rounded flex items-center justify-center text-[#679bbc] hover:bg-[#679bbc]/15 cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteEntry(entry.id)}
                                  className="w-6 h-6 rounded flex items-center justify-center text-[#c11720] hover:bg-[#c11720]/15 cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Produtos (Full CRUD without mock data) ───────────────────────────────────
function ProdutosScreen({
  products,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onNav,
  initialSearch = "",
}: {
  products: Product[];
  onCreateProduct: (data: Omit<Product, "id">) => Promise<Product | null>;
  onUpdateProduct: (id: number, data: Omit<Product, "id">) => Promise<Product | null>;
  onDeleteProduct: (id: number) => Promise<boolean>;
  onNav: (screen: string) => void;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showFilters, setShowFilters] = useState(false);

  const [selected, setSelected] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState("geral");
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    sku: "",
    nome: "",
    categoria: "",
    preco: "",
    custo: "",
    estoque: "",
    estoque_minimo: "10",
    status: "Ativo",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  // Keep selected product synchronized with products list
  useEffect(() => {
    if (selected) {
      const updated = products.find((p) => p.id === selected.id) || null;
      setSelected(updated);
    }
  }, [products]);

  useEffect(() => {
    if (selected && activeTab === "estoque") {
      fetch(`/api/products/${selected.id}/movements`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setMovements)
        .catch(() => setMovements([]));
    }
  }, [selected, activeTab]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.categoria).filter(Boolean))),
    [products]
  );

  function openCreateModal() {
    setEditingProduct(null);
    setFormData({
      sku: "",
      nome: "",
      categoria: "",
      preco: "",
      custo: "",
      estoque: "0",
      estoque_minimo: "10",
      status: "Ativo",
    });
    setShowModal(true);
  }

  function openEditModal(prod: Product) {
    setEditingProduct(prod);
    setFormData({
      sku: prod.sku,
      nome: prod.nome,
      categoria: prod.categoria,
      preco: String(prod.preco),
      custo: String(prod.custo),
      estoque: String(prod.estoque),
      estoque_minimo: String(prod.estoque_minimo ?? 10),
      status: prod.status,
    });
    setShowModal(true);
  }

  async function handleSaveProduct() {
    if (!formData.sku.trim() || !formData.nome.trim() || !formData.categoria.trim() || !formData.preco || !formData.custo) {
      toast.error("Preencha todos os campos obrigatórios (*)");
      return;
    }

    const preco = parseFloat(formData.preco);
    const custo = parseFloat(formData.custo);
    const estoque = parseInt(formData.estoque) || 0;
    const estoqueMinimo = parseInt(formData.estoque_minimo) || 10;

    if (isNaN(preco) || preco < 0 || isNaN(custo) || custo < 0) {
      toast.error("Informe valores numéricos válidos para preço e custo");
      return;
    }

    setLoading(true);
    try {
      const payload: Omit<Product, "id"> = {
        sku: formData.sku.trim(),
        nome: formData.nome.trim(),
        categoria: formData.categoria.trim(),
        preco,
        custo,
        estoque,
        estoque_minimo: estoqueMinimo,
        status: computeProductStatus(estoque, estoqueMinimo),
      };

      if (editingProduct) {
        const updated = await onUpdateProduct(editingProduct.id, payload);
        if (updated) {
          setShowModal(false);
          setEditingProduct(null);
        }
      } else {
        const created = await onCreateProduct(payload);
        if (created) {
          setShowModal(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.categoria.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "todas" || p.categoria === categoryFilter;
    const matchesStatus = statusFilter === "todos" || p.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  if (selected) {
    const margin =
      selected.preco > 0
        ? (((selected.preco - selected.custo) / selected.preco) * 100).toFixed(1)
        : "0.0";
    return (
      <div className="p-4 sm:p-6">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-[#679bbc] text-sm mb-5 hover:text-[#e8f0f7] transition-colors cursor-pointer"
        >
          <ArrowLeft size={13} /> Voltar à listagem
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-[#e8f0f7]" style={DISPLAY}>{selected.nome}</h1>
              <Badge variant={selected.status === "Ativo" ? "success" : selected.status === "Crítico" ? "warning" : "danger"}>
                {selected.status}
              </Badge>
            </div>
            <p className="text-[#8fafc5] text-sm font-mono">SKU: {selected.sku} · {selected.categoria}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Btn variant="outline" size="sm" onClick={() => openEditModal(selected)}>
              <Edit size={12} /> Editar
            </Btn>
            <Btn
              variant="danger"
              size="sm"
              onClick={async () => {
                if (window.confirm(`Deseja realmente excluir o produto "${selected.nome}"?`)) {
                  const ok = await onDeleteProduct(selected.id);
                  if (ok) setSelected(null);
                }
              }}
            >
              <Trash2 size={12} /> Excluir
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => onNav("pedido")}>
              <ShoppingCart size={12} /> Criar Pedido
            </Btn>
          </div>
        </div>

        <TabStrip
          tabs={["geral", "estoque"]}
          active={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === "geral" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 space-y-4">
              <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#e8f0f7] mb-4">Informações Cadastradas</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-lg bg-[#0b3048]/40 border border-[#679bbc]/15">
                    <div className="text-[#8fafc5] uppercase text-[10px] mb-1">Nome do Produto</div>
                    <div className="text-[#e8f0f7] font-semibold text-sm">{selected.nome}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0b3048]/40 border border-[#679bbc]/15">
                    <div className="text-[#8fafc5] uppercase text-[10px] mb-1">SKU</div>
                    <div className="text-[#679bbc] font-mono font-semibold text-sm">{selected.sku}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0b3048]/40 border border-[#679bbc]/15">
                    <div className="text-[#8fafc5] uppercase text-[10px] mb-1">Categoria</div>
                    <div className="text-[#e8f0f7] font-semibold text-sm">{selected.categoria}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0b3048]/40 border border-[#679bbc]/15">
                    <div className="text-[#8fafc5] uppercase text-[10px] mb-1">Estoque Mínimo</div>
                    <div className="text-[#e8f0f7] font-mono font-semibold text-sm">{selected.estoque_minimo ?? 10} un.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#e8f0f7] mb-4">Resumo Financeiro</h3>
                <div className="space-y-3">
                  {[
                    { l: "Preço de venda", v: fmt(selected.preco), cl: "text-emerald-400" },
                    { l: "Custo unitário", v: fmt(selected.custo), cl: "text-[#e8f0f7]" },
                    { l: "Margem bruta", v: `${margin}%`, cl: "text-[#679bbc]" },
                    { l: "Estoque atual", v: `${selected.estoque} un.`, cl: selected.estoque <= (selected.estoque_minimo ?? 10) ? "text-[#c11720]" : "text-emerald-400" },
                    { l: "Valor em estoque", v: fmt(selected.custo * selected.estoque), cl: "text-[#e8f0f7]" },
                  ].map((row) => (
                    <div key={row.l} className="flex justify-between text-sm">
                      <span className="text-[#8fafc5]">{row.l}</span>
                      <span className={cn("font-semibold font-mono text-xs", row.cl)}>{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "estoque" && (
          <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#679bbc]/12 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#e8f0f7]">Movimentação de Estoque</h3>
              <Btn variant="outline" size="sm" onClick={() => onNav("estoque")}>
                Ajustar Estoque
              </Btn>
            </div>
            {movements.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#8fafc5]">
                Nenhuma movimentação registrada para este produto ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#8fafc5] border-b border-[#679bbc]/10">
                      <th className="px-5 py-3 text-left font-medium">Data</th>
                      <th className="px-5 py-3 text-left font-medium">Tipo</th>
                      <th className="px-5 py-3 text-left font-medium">Motivo</th>
                      <th className="px-5 py-3 text-right font-medium">Qtd.</th>
                      <th className="px-5 py-3 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#679bbc]/8">
                    {movements.map((row) => (
                      <tr key={row.id} className="hover:bg-[#679bbc]/5 transition-colors">
                        <td className="px-5 py-3 text-[#8fafc5] font-mono">
                          {new Date(row.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={row.quantidade > 0 ? "success" : "danger"}>{row.tipo}</Badge>
                        </td>
                        <td className="px-5 py-3 text-[#e8f0f7]">{row.motivo}</td>
                        <td className={cn("px-5 py-3 text-right font-mono font-semibold", row.quantidade > 0 ? "text-emerald-400" : "text-[#c11720]")}>
                          {row.quantidade > 0 ? `+${row.quantidade}` : row.quantidade}
                        </td>
                        <td className="px-5 py-3 text-right text-[#e8f0f7] font-mono">{row.saldo} un.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Produtos"
        subtitle={`${products.length} produto(s) cadastrado(s)`}
        action={
          <div className="flex gap-2">
            <Btn variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
              <Filter size={12} /> Filtros
            </Btn>
            <Btn variant="primary" size="sm" onClick={openCreateModal}>
              <Plus size={12} /> Novo Produto
            </Btn>
          </div>
        }
      />

      <div className="mb-4 space-y-3">
        <Field placeholder="Buscar por nome, SKU ou categoria..." value={search} onChange={setSearch} icon={<Search size={13} />} />

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl">
            <div>
              <label className="text-[10px] font-semibold text-[#8fafc5] uppercase block mb-1">Categoria</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-3 py-2 text-xs text-[#e8f0f7]"
              >
                <option value="todas" className="bg-[#0c1d2e]">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c} value={c} className="bg-[#0c1d2e]">{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#8fafc5] uppercase block mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-3 py-2 text-xs text-[#e8f0f7]"
              >
                <option value="todos" className="bg-[#0c1d2e]">Todos os status</option>
                <option value="Ativo" className="bg-[#0c1d2e]">Ativo</option>
                <option value="Crítico" className="bg-[#0c1d2e]">Crítico</option>
                <option value="Sem Estoque" className="bg-[#0c1d2e]">Sem Estoque</option>
              </select>
            </div>
            <div className="flex items-end">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategoryFilter("todas");
                  setStatusFilter("todos");
                  setSearch("");
                }}
              >
                Limpar filtros
              </Btn>
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#679bbc]/12 text-[#8fafc5] bg-[#0b3048]/30">
                <th className="px-4 py-3 text-left font-medium">SKU</th>
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium">Categoria</th>
                <th className="px-4 py-3 text-right font-medium">Preço</th>
                <th className="px-4 py-3 text-right font-medium">Custo</th>
                <th className="px-4 py-3 text-center font-medium">Estoque</th>
                <th className="px-4 py-3 text-center font-medium">Mín.</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#679bbc]/8">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-[#679bbc]/5 transition-colors cursor-pointer"
                  onClick={() => setSelected(p)}
                >
                  <td className="px-4 py-3 font-mono text-[#679bbc] text-[11px]">{p.sku}</td>
                  <td className="px-4 py-3 font-medium text-[#e8f0f7]">{p.nome}</td>
                  <td className="px-4 py-3 text-[#8fafc5]">{p.categoria}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmt(p.preco)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#8fafc5]">{fmt(p.custo)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={p.estoque <= 0 ? "danger" : p.estoque <= (p.estoque_minimo ?? 10) ? "warning" : "success"}>
                      {p.estoque}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-[#8fafc5]">{p.estoque_minimo ?? 10}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={p.status === "Ativo" ? "success" : p.status === "Crítico" ? "warning" : "danger"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="w-6 h-6 rounded flex items-center justify-center text-[#679bbc] hover:bg-[#679bbc]/15 transition-all cursor-pointer"
                        onClick={() => setSelected(p)}
                        title="Visualizar"
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        className="w-6 h-6 rounded flex items-center justify-center text-[#679bbc] hover:bg-[#679bbc]/15 transition-all cursor-pointer"
                        onClick={() => openEditModal(p)}
                        title="Editar produto"
                      >
                        <Edit size={12} />
                      </button>
                      <button
                        className="w-6 h-6 rounded flex items-center justify-center text-[#c11720] hover:bg-[#c11720]/15 transition-all cursor-pointer"
                        onClick={() => {
                          if (window.confirm(`Tem certeza que deseja excluir o produto "${p.nome}"?`)) {
                            onDeleteProduct(p.id);
                          }
                        }}
                        title="Excluir produto"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-[#8fafc5] text-sm">
            {products.length === 0
              ? "Nenhum produto cadastrado ainda. Clique em 'Novo Produto' para adicionar."
              : `Nenhum produto encontrado para o filtro aplicado.`}
          </div>
        )}
      </div>

      {/* MODAL DE NOVO / EDITAR PRODUTO */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1d2e] border border-[#679bbc]/20 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#e8f0f7]" style={DISPLAY}>
                {editingProduct ? "Editar Produto" : "Novo Produto"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-[#8fafc5] hover:text-[#e8f0f7] cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">SKU *</label>
                <input
                  type="text"
                  placeholder="Ex: CAM-BAS-BRA-P"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Nome do Produto *</label>
                <input
                  type="text"
                  placeholder="Ex: Camiseta Básica Branca P"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Categoria *</label>
                <input
                  type="text"
                  placeholder="Básica, Premium, Oversized..."
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                  className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Preço de Venda (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="45.00"
                    value={formData.preco}
                    onChange={(e) => setFormData({ ...formData, preco: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Custo Unitário (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="28.00"
                    value={formData.custo}
                    onChange={(e) => setFormData({ ...formData, custo: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Estoque Atual</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.estoque}
                    onChange={(e) => setFormData({ ...formData, estoque: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Estoque Mínimo (Alerta)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="10"
                    value={formData.estoque_minimo}
                    onChange={(e) => setFormData({ ...formData, estoque_minimo: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Btn>
              <Btn variant="primary" onClick={handleSaveProduct} disabled={loading}>
                {loading ? "Salvando..." : editingProduct ? "Salvar Alterações" : "Adicionar Produto"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Banco DTF ────────────────────────────────────────────────────────────────
function BancoDTFScreen({
  designs,
  onUpdateStock,
  onDesignCreated,
  onDesignUpdated,
  onDeleteDesign,
}: {
  designs: DTFDesign[];
  onUpdateStock: (id: number, newQty: number) => Promise<void>;
  onDesignCreated: (design: DTFDesign) => void;
  onDesignUpdated: (design: DTFDesign) => void;
  onDeleteDesign: (id: number) => Promise<void>;
}) {
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todas");
  const [selected, setSelected] = useState<DTFDesign | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const [showModalDTF, setShowModalDTF] = useState(false);
  const [editingDesign, setEditingDesign] = useState<DTFDesign | null>(null);
  const [formDataDTF, setFormDataDTF] = useState({
    nome: "",
    cat: "",
    dpi: "300",
    tam: "A4",
    versoes: "1",
    lic: "Padrão",
    usos: "0",
    hue: "#10b981",
    estoque: "0",
  });
  const [imagemDTF, setImagemDTF] = useState<string | null>(null);
  const [loadingDTF, setLoadingDTF] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(designs.map((d) => d.cat).filter(Boolean))),
    [designs]
  );

  function openNewDTFModal() {
    setEditingDesign(null);
    setFormDataDTF({
      nome: "",
      cat: "",
      dpi: "300",
      tam: "A4",
      versoes: "1",
      lic: "Padrão",
      usos: "0",
      hue: "#10b981",
      estoque: "0",
    });
    setImagemDTF(null);
    setShowModalDTF(true);
  }

  function openEditDTFModal(d: DTFDesign) {
    setEditingDesign(d);
    setFormDataDTF({
      nome: d.nome,
      cat: d.cat,
      dpi: String(d.dpi || 300),
      tam: d.tam || "A4",
      versoes: String(d.versoes || 1),
      lic: d.lic || "Padrão",
      usos: String(d.usos || 0),
      hue: d.hue || "#10b981",
      estoque: String(d.estoque || 0),
    });
    setImagemDTF(d.local_image || null);
    setShowModalDTF(true);
  }

  function handleImageFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 50MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setImagemDTF(reader.result as string);
    reader.readAsDataURL(file);
    if (!showModalDTF) {
      openNewDTFModal();
    }
  }

  const handleSaveDTF = async () => {
    if (!formDataDTF.nome.trim() || !formDataDTF.cat.trim()) {
      toast.error("Preencha o nome e a categoria do design");
      return;
    }

    setLoadingDTF(true);
    const payload = {
      nome: formDataDTF.nome.trim(),
      cat: formDataDTF.cat.trim(),
      dpi: parseInt(formDataDTF.dpi) || 300,
      tam: formDataDTF.tam,
      versoes: parseInt(formDataDTF.versoes) || 1,
      lic: formDataDTF.lic,
      usos: parseInt(formDataDTF.usos) || 0,
      hue: formDataDTF.hue,
      estoque: parseInt(formDataDTF.estoque) || 0,
      imagem: imagemDTF,
      mimeType: imagemDTF?.match(/^data:([^;]+);/)?.[1] || null,
    };

    try {
      const response = await fetch(
        editingDesign ? `/api/designs/${editingDesign.id}` : "/api/designs",
        {
          method: editingDesign ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const saved = await response.json();
        const withPreview = imagemDTF ? { ...saved, local_image: imagemDTF } : saved;
        if (editingDesign) {
          onDesignUpdated(withPreview);
          toast.success(`Design "${saved.nome}" atualizado!`);
        } else {
          onDesignCreated(withPreview);
          toast.success(`Design "${saved.nome}" cadastrado com sucesso!`);
        }
        setShowModalDTF(false);
        setEditingDesign(null);
        setImagemDTF(null);
      } else {
        const errorBody = await response.json().catch(() => null);
        toast.error(errorBody?.error || "Erro ao salvar design");
      }
    } catch {
      // Fallback local
      if (editingDesign) {
        const fallbackDesign: DTFDesign = {
          ...editingDesign,
          ...payload,
          has_image: Boolean(imagemDTF || editingDesign.has_image),
          local_image: imagemDTF || editingDesign.local_image,
        };
        onDesignUpdated(fallbackDesign);
        toast.success(`Design "${fallbackDesign.nome}" atualizado localmente!`);
      } else {
        const fallbackDesign: DTFDesign = {
          id: Date.now(),
          ...payload,
          has_image: Boolean(imagemDTF),
          local_image: imagemDTF || undefined,
        };
        onDesignCreated(fallbackDesign);
        toast.success(`Design "${fallbackDesign.nome}" cadastrado localmente!`);
      }
      setShowModalDTF(false);
      setEditingDesign(null);
      setImagemDTF(null);
    } finally {
      setLoadingDTF(false);
    }
  };

  const filtered = designs.filter((d) => {
    const matchSearch =
      d.nome.toLowerCase().includes(search.toLowerCase()) ||
      d.cat.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "todas" || d.cat === catFilter;
    return matchSearch && matchCat;
  });

  const critical = designs.filter((d) => d.estoque > 0 && d.estoque <= 10);
  const outOfStock = designs.filter((d) => d.estoque === 0);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Banco DTF"
        subtitle={`${designs.length} design(s) · ${designs.reduce((s, d) => s + d.estoque, 0)} impressões disponíveis`}
        action={
          <div className="flex gap-2">
            {categories.length > 0 && (
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="bg-[#0b3048] border border-[#679bbc]/30 rounded-md px-3 py-1.5 text-xs text-[#e8f0f7]"
              >
                <option value="todas">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <Btn variant="primary" size="sm" onClick={openNewDTFModal}>
              <Upload size={12} /> Novo Design DTF
            </Btn>
          </div>
        }
      />

      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-7 mb-5 text-center transition-all cursor-pointer",
          dragging
            ? "border-[#c11720] bg-[#c11720]/5 scale-[1.01]"
            : "border-[#679bbc]/20 bg-[#0b3048]/15 hover:border-[#679bbc]/40 hover:bg-[#679bbc]/4"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleImageFile(e.dataTransfer.files[0]);
        }}
        onClick={openNewDTFModal}
      >
        <div className={cn("w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center transition-colors",
          dragging ? "bg-[#c11720]/20" : "bg-[#679bbc]/10")}>
          <Upload size={18} className={dragging ? "text-[#c11720]" : "text-[#679bbc]"} />
        </div>
        <p className="text-sm font-semibold text-[#e8f0f7] mb-1">
          {dragging ? "Solte os arquivos aqui" : "Arraste seus arquivos DTF ou clique para cadastrar"}
        </p>
        <p className="text-xs text-[#8fafc5]">PNG, JPG ou WEBP · mínimo 300 DPI · máximo 50MB por arquivo</p>
      </div>

      {/* Critical stock alerts */}
      {(critical.length > 0 || outOfStock.length > 0) && (
        <div className="mb-4 p-3 bg-[#c11720]/6 border border-[#c11720]/20 rounded-xl flex items-start gap-3">
          <AlertTriangle size={15} className="text-[#c11720] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-[#e8f0f7]">
            {outOfStock.length > 0 && (
              <span className="font-semibold text-[#c11720]">{outOfStock.length} design{outOfStock.length > 1 ? "s" : ""} esgotado{outOfStock.length > 1 ? "s" : ""}: </span>
            )}
            {outOfStock.map((d) => d.nome).join(", ")}
            {outOfStock.length > 0 && critical.length > 0 && " · "}
            {critical.length > 0 && (
              <span className="text-amber-400 font-semibold">{critical.length} com estoque crítico: </span>
            )}
            {critical.map((d) => `${d.nome} (${d.estoque})`).join(", ")}
          </div>
        </div>
      )}

      <div className="mb-4">
        <Field placeholder="Buscar designs, categorias..." value={search} onChange={setSearch} icon={<Search size={13} />} />
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl text-sm text-[#8fafc5]">
          {designs.length === 0
            ? "Nenhum design DTF cadastrado ainda. Clique em 'Novo Design DTF' para enviar o primeiro."
            : "Nenhum design DTF encontrado para esta busca."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {filtered.map((design) => {
            const estoqueLow = design.estoque > 0 && design.estoque <= 10;
            const estoqueZero = design.estoque === 0;
            return (
              <div
                key={design.id}
                onClick={() => {
                  if (editingId === design.id) return;
                  setSelected(design);
                }}
                className={cn(
                  "bg-[#0c1d2e] border rounded-xl overflow-hidden transition-all hover:shadow-lg hover:shadow-black/30",
                  estoqueZero ? "opacity-75 border-[#679bbc]/10" :
                    selected?.id === design.id ? "border-[#c11720] ring-1 ring-[#c11720]/30 cursor-pointer"
                    : "border-[#679bbc]/15 hover:border-[#679bbc]/35 cursor-pointer"
                )}
              >
                <div className="h-36 flex items-center justify-center relative" style={{ backgroundColor: design.hue + "12" }}>
                  <div className="absolute inset-0" style={{ background: `radial-gradient(circle at center, ${design.hue}18, transparent 70%)` }} />
                  <div className="w-20 h-20 rounded-xl flex items-center justify-center relative z-10 overflow-hidden"
                    style={{ backgroundColor: design.hue + "20", border: `1.5px solid ${design.hue}35` }}>
                    {design.local_image ? (
                      <img src={design.local_image} alt={design.nome} className="w-full h-full object-cover" />
                    ) : design.has_image ? (
                      <img src={`/api/designs/${design.id}/image`} alt={design.nome} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[22px] font-black font-mono leading-none" style={{ color: design.hue }}>
                        {design.nome.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {/* Stock badge — click to edit */}
                  <div
                    className="absolute top-2 left-2 group z-20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(design.id);
                      setEditValue(String(design.estoque));
                    }}
                    title="Clique para editar estoque"
                  >
                    {editingId === design.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const v = Math.max(0, parseInt(editValue) || 0);
                              onUpdateStock(design.id, v);
                              setEditingId(null);
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => {
                            const v = Math.max(0, parseInt(editValue) || 0);
                            onUpdateStock(design.id, v);
                            setEditingId(null);
                          }}
                          className="w-16 h-6 px-1.5 text-[11px] font-semibold rounded-md bg-[#0c1d2e] border border-[#679bbc]/50 text-[#e8f0f7] focus:outline-none focus:border-[#679bbc]"
                        />
                        <Check size={11} className="text-emerald-400 flex-shrink-0" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 cursor-pointer">
                        <Badge variant={estoqueZero ? "danger" : estoqueLow ? "warning" : "success"}>
                          {estoqueZero ? "Esgotado" : `${design.estoque} un.`}
                        </Badge>
                        <Edit size={9} className="text-[#679bbc]/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    )}
                  </div>

                  {/* Edit / Delete actions */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 z-20" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openEditDTFModal(design)}
                      className="w-6 h-6 rounded bg-[#0c1d2e]/80 text-[#679bbc] hover:text-white flex items-center justify-center cursor-pointer"
                      title="Editar design"
                    >
                      <Edit size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Excluir o design "${design.nome}"?`)) {
                          onDeleteDesign(design.id);
                        }
                      }}
                      className="w-6 h-6 rounded bg-[#0c1d2e]/80 text-[#c11720] hover:bg-[#c11720] hover:text-white flex items-center justify-center cursor-pointer"
                      title="Excluir design"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-[13px] font-semibold text-[#e8f0f7] truncate">{design.nome}</div>
                  <div className="text-[10px] text-[#8fafc5] mt-0.5">{design.cat} · {design.tam} · {design.dpi} DPI</div>
                  <div className="mt-2 pt-2 border-t border-[#679bbc]/10">
                    <div className="h-1 bg-[#0b3048] rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (design.estoque / 80) * 100)}%`,
                          backgroundColor: estoqueZero ? "#c11720" : estoqueLow ? "#f59e0b" : "#10b981",
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#679bbc]">{design.versoes}v · {design.lic}</span>
                      <button
                        className={cn("text-[10px] font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer",
                          estoqueZero ? "text-[#c11720]" : estoqueLow ? "text-amber-400" : "text-emerald-400"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(design.id);
                          setEditValue(String(design.estoque));
                        }}
                      >
                        <Edit size={8} className="opacity-60" />
                        {estoqueZero ? "Esgotado" : `${design.estoque} impressões`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE NOVO / EDITAR DTF */}
      {showModalDTF && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1d2e] border border-[#679bbc]/20 rounded-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#e8f0f7]" style={DISPLAY}>
                {editingDesign ? "Editar Design DTF" : "Novo Design DTF"}
              </h2>
              <button onClick={() => setShowModalDTF(false)} className="text-[#8fafc5] hover:text-[#e8f0f7] cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Nome do Design *</label>
                <input
                  type="text"
                  placeholder="Ex: Estampa Minimalista"
                  value={formDataDTF.nome}
                  onChange={(e) => setFormDataDTF({ ...formDataDTF, nome: e.target.value })}
                  className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Categoria *</label>
                <input
                  type="text"
                  placeholder="Logotipo, Natureza, Urbano..."
                  value={formDataDTF.cat}
                  onChange={(e) => setFormDataDTF({ ...formDataDTF, cat: e.target.value })}
                  className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">DPI</label>
                  <select
                    value={formDataDTF.dpi}
                    onChange={(e) => setFormDataDTF({ ...formDataDTF, dpi: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  >
                    <option>300</option>
                    <option>600</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Tamanho</label>
                  <select
                    value={formDataDTF.tam}
                    onChange={(e) => setFormDataDTF({ ...formDataDTF, tam: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  >
                    <option>A5</option>
                    <option>A4</option>
                    <option>A3</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Versões</label>
                  <input
                    type="number"
                    min="1"
                    value={formDataDTF.versoes}
                    onChange={(e) => setFormDataDTF({ ...formDataDTF, versoes: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Licença</label>
                  <select
                    value={formDataDTF.lic}
                    onChange={(e) => setFormDataDTF({ ...formDataDTF, lic: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  >
                    <option>Padrão</option>
                    <option>Exclusivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Estoque de Impressões</label>
                  <input
                    type="number"
                    min="0"
                    value={formDataDTF.estoque}
                    onChange={(e) => setFormDataDTF({ ...formDataDTF, estoque: e.target.value })}
                    className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Cor de Destaque</label>
                  <input
                    type="color"
                    value={formDataDTF.hue}
                    onChange={(e) => setFormDataDTF({ ...formDataDTF, hue: e.target.value })}
                    className="w-full px-3 py-1 bg-[#070e17] border border-[#679bbc]/15 rounded-lg h-10 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#e8f0f7] mb-1.5 block">Upload de Imagem (Opcional)</label>
                <input
                  id="dtf-image-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleImageFile(e.target.files?.[0])}
                  className="w-full px-3 py-2 bg-[#070e17] border border-[#679bbc]/15 rounded-lg text-[#e8f0f7] text-sm"
                />
                {imagemDTF && (
                  <img src={imagemDTF} alt="Preview do DTF" className="mt-2 h-28 w-full rounded-lg object-contain bg-[#070e17]" />
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Btn variant="ghost" onClick={() => setShowModalDTF(false)}>Cancelar</Btn>
              <Btn variant="primary" onClick={handleSaveDTF} disabled={loadingDTF}>
                {loadingDTF ? "Salvando..." : editingDesign ? "Salvar Alterações" : "Adicionar Design"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Criar Pedido ─────────────────────────────────────────────────────────────
function MockupCanvas({ design, color }: { design: DTFDesign; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = (image?: HTMLImageElement) => {
      const scale = 2;
      canvas.width = 320 * scale;
      canvas.height = 360 * scale;
      context.scale(scale, scale);
      context.clearRect(0, 0, 320, 360);

      context.fillStyle = "#0b3048";
      context.fillRect(0, 0, 320, 360);
      context.fillStyle = "rgba(255,255,255,0.06)";
      context.beginPath();
      context.ellipse(160, 330, 105, 13, 0, 0, Math.PI * 2);
      context.fill();

      const shirt = new Path2D(
        "M105 78 L58 105 L23 160 L63 184 L88 145 L82 318 Q160 340 238 318 L232 145 L257 184 L297 160 L262 105 L215 78 Q194 108 160 108 Q126 108 105 78 Z"
      );
      context.fillStyle = color;
      context.fill(shirt);
      context.strokeStyle = "rgba(255,255,255,0.22)";
      context.lineWidth = 2;
      context.stroke(shirt);

      context.fillStyle = "rgba(0,0,0,0.14)";
      context.beginPath();
      context.arc(160, 86, 28, 0, Math.PI);
      context.fill();

      if (image) {
        const ratio = Math.min(100 / image.width, 100 / image.height);
        const width = image.width * ratio;
        const height = image.height * ratio;
        context.globalAlpha = 0.96;
        context.drawImage(image, 160 - width / 2, 165 - height / 2, width, height);
        context.globalAlpha = 1;
      } else {
        context.fillStyle = "rgba(255,255,255,0.8)";
        context.font = "bold 18px sans-serif";
        context.textAlign = "center";
        context.fillText(design.nome.slice(0, 12), 160, 170);
      }
    };

    const src = design.local_image || (design.has_image ? `/api/designs/${design.id}/image` : null);
    if (!src) {
      draw();
      return;
    }
    const image = new Image();
    image.onload = () => draw(image);
    image.onerror = () => draw();
    image.src = src;
  }, [design, color]);

  return <canvas ref={canvasRef} className="w-full h-full object-contain" aria-label={`Mockup de ${design.nome}`} />;
}

function CriarPedidoScreen({
  products,
  designs,
  onOrderCreated,
  onNav,
}: {
  products: Product[];
  designs: DTFDesign[];
  onOrderCreated: (card: KCard, productId: number, dtfId: number, qty: number) => void;
  onNav: (screen: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [cliente, setCliente] = useState("");
  const [sku, setSku] = useState<Product | null>(null);
  const [dtf, setDtf] = useState<DTFDesign | null>(null);
  const [qtd, setQtd] = useState("1");
  const [pagamento, setPagamento] = useState("pix");
  const [mockupColor, setMockupColor] = useState("#f4f4f5");
  const [clienteDados, setClienteDados] = useState({
    cpfCnpj: "",
    telefone: "",
    email: "",
    endereco: "",
    cidade: "",
    uf: "",
    cep: "",
  });
  const [prazo, setPrazo] = useState(getTodayIso());

  const steps = ["Cliente", "Itens", "Pagamento"];
  const qty = Math.max(1, parseInt(qtd) || 1);

  const liveSku = sku ? products.find((p) => p.id === sku.id) ?? sku : null;
  const liveDtf = dtf ? designs.find((d) => d.id === dtf.id) ?? dtf : null;
  const prodSuficiente = liveSku ? liveSku.estoque >= qty : false;
  const dtfSuficiente = liveDtf ? liveDtf.estoque >= qty : false;

  async function finish() {
    if (!liveDtf || !liveSku || !cliente.trim() || !prazo) {
      toast.error("Preencha o cliente, itens e prazo de entrega");
      return;
    }
    if (!prodSuficiente || !dtfSuficiente) {
      toast.error("Estoque insuficiente para a quantidade solicitada");
      return;
    }
    const valorTotal = liveSku.preco * qty;
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: cliente.trim(),
          ...clienteDados,
          productId: liveSku.id,
          dtfId: liveDtf.id,
          quantidade: qty,
          pagamento,
          prazo,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Erro ao criar pedido");
      onOrderCreated(
        {
          ...body,
          id: String(body.id),
          valor_total: Number(body.valor_total ?? valorTotal),
          created_at: body.created_at || new Date().toISOString(),
        },
        liveSku.id,
        liveDtf.id,
        qty
      );
      toast.success("Pedido criado e enviado para Aguardando produção!");
      setStep(0);
      setCliente("");
      setSku(null);
      setDtf(null);
      setQtd("1");
      setPrazo(getTodayIso());
      setClienteDados({ cpfCnpj: "", telefone: "", email: "", endereco: "", cidade: "", uf: "", cep: "" });
    } catch {
      const fallbackOrder: KCard = {
        id: String(Date.now()),
        cliente: cliente.trim(),
        cpf_cnpj: clienteDados.cpfCnpj,
        telefone: clienteDados.telefone,
        email: clienteDados.email,
        endereco: clienteDados.endereco,
        cidade: clienteDados.cidade,
        uf: clienteDados.uf,
        cep: clienteDados.cep,
        produto: liveSku.nome,
        dtf: liveDtf.nome,
        product_id: liveSku.id,
        dtf_id: liveDtf.id,
        qtd: qty,
        valor_total: valorTotal,
        pagamento,
        status: "aguardando",
        prazo: formatIsoToBr(prazo),
        prazo_iso: prazo,
        created_at: new Date().toISOString(),
      };
      onOrderCreated(fallbackOrder, liveSku.id, liveDtf.id, qty);
      toast.success("Pedido criado localmente e enviado para Produção!");
      setStep(0);
      setCliente("");
      setSku(null);
      setDtf(null);
      setQtd("1");
      setPrazo(getTodayIso());
    }
  }

  const total = liveSku ? liveSku.preco * qty : 0;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Criar Pedido" subtitle="Preencha as etapas para registrar um novo pedido" />

      {/* Step indicator */}
      <div className="flex items-center mb-8 max-w-md">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all flex-shrink-0",
              i < step ? "bg-emerald-500 text-white" : i === step ? "bg-[#c11720] text-white shadow-lg shadow-[#c11720]/30" : "bg-[#0b3048] text-[#8fafc5] border border-[#679bbc]/20"
            )}>
              {i < step ? <Check size={13} /> : i + 1}
            </div>
            <span className={cn("ml-2 text-xs font-medium", i <= step ? "text-[#e8f0f7]" : "text-[#8fafc5]")}>{s}</span>
            {i < steps.length - 1 && (
              <div className={cn("flex-1 h-px mx-3 transition-all", i < step ? "bg-emerald-500/40" : "bg-[#679bbc]/12")} />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          {/* Step 0: Client */}
          {step === 0 && (
            <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-[#e8f0f7] mb-5">Dados do Cliente</h3>
              <div className="space-y-4">
                <Field label="Nome / Razão Social *" value={cliente} onChange={setCliente} placeholder="Ex: Studio Arte Ltda" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="CPF / CNPJ" value={clienteDados.cpfCnpj} onChange={(value) => setClienteDados({ ...clienteDados, cpfCnpj: value })} placeholder="00.000.000/0001-00" />
                  <Field label="Telefone" value={clienteDados.telefone} onChange={(value) => setClienteDados({ ...clienteDados, telefone: value })} placeholder="(11) 99999-9999" />
                </div>
                <Field label="E-mail" type="email" value={clienteDados.email} onChange={(value) => setClienteDados({ ...clienteDados, email: value })} placeholder="cliente@email.com" icon={<Mail size={13} />} />
                <Field label="Endereço de entrega" value={clienteDados.endereco} onChange={(value) => setClienteDados({ ...clienteDados, endereco: value })} placeholder="Rua, número, bairro" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Cidade" value={clienteDados.cidade} onChange={(value) => setClienteDados({ ...clienteDados, cidade: value })} placeholder="São Paulo" />
                  <Field label="UF" value={clienteDados.uf} onChange={(value) => setClienteDados({ ...clienteDados, uf: value })} placeholder="SP" />
                  <Field label="CEP" value={clienteDados.cep} onChange={(value) => setClienteDados({ ...clienteDados, cep: value })} placeholder="01000-000" />
                </div>
                <Field label="Prazo de entrega *" type="date" value={prazo} onChange={setPrazo} />
              </div>
              <div className="flex justify-end mt-5">
                <Btn variant="primary" onClick={() => { if (cliente.trim() && prazo) setStep(1); else toast.error("Informe o nome do cliente e o prazo de entrega"); }}>
                  Próximo <ArrowRight size={14} />
                </Btn>
              </div>
            </div>
          )}

          {/* Step 1: Items */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[#e8f0f7]">Selecionar Produto (SKU)</h3>
                  <Btn variant="ghost" size="sm" onClick={() => onNav("produtos")}>+ Cadastrar Produto</Btn>
                </div>
                {products.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#8fafc5]">
                    Nenhum produto cadastrado. Cadastre um produto na aba <strong className="text-[#e8f0f7]">Produtos</strong> primeiro.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {products.map((p) => {
                      const semEstoque = p.estoque <= 0;
                      return (
                        <button
                          key={p.id}
                          disabled={semEstoque}
                          onClick={() => setSku(p)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer",
                            semEstoque
                              ? "opacity-40 cursor-not-allowed border-[#679bbc]/10"
                              : sku?.id === p.id
                              ? "border-[#c11720] bg-[#c11720]/6"
                              : "border-[#679bbc]/12 hover:border-[#679bbc]/35 hover:bg-[#679bbc]/5"
                          )}
                        >
                          <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                            sku?.id === p.id ? "border-[#c11720] bg-[#c11720]" : "border-[#679bbc]/35")}>
                            {sku?.id === p.id && <Check size={9} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[#e8f0f7] truncate">{p.nome}</div>
                            <div className="text-[10px] text-[#8fafc5] font-mono">{p.sku} · {p.estoque} em estoque</div>
                          </div>
                          <div className="text-sm font-mono text-emerald-400 flex-shrink-0">{fmt(p.preco)}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[#e8f0f7]">Selecionar Design DTF</h3>
                  <Btn variant="ghost" size="sm" onClick={() => onNav("dtf")}>+ Cadastrar DTF</Btn>
                </div>
                {designs.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#8fafc5]">
                    Nenhum design DTF cadastrado. Cadastre um design na aba <strong className="text-[#e8f0f7]">Banco DTF</strong> primeiro.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {designs.map((d) => {
                      const sem = d.estoque === 0;
                      const baixo = d.estoque > 0 && d.estoque < qty;
                      return (
                        <button
                          key={d.id}
                          disabled={sem}
                          onClick={() => setDtf(d)}
                          className={cn("p-3 rounded-lg border text-left transition-all relative cursor-pointer",
                            sem ? "opacity-40 cursor-not-allowed border-[#679bbc]/10" :
                            dtf?.id === d.id ? "border-[#c11720] bg-[#c11720]/6" : "border-[#679bbc]/12 hover:border-[#679bbc]/35"
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg mb-1.5 flex items-center justify-center" style={{ backgroundColor: d.hue + "20" }}>
                            <span className="text-[11px] font-black font-mono" style={{ color: d.hue }}>{d.nome.slice(0, 2).toUpperCase()}</span>
                          </div>
                          <div className="text-[11px] font-semibold text-[#e8f0f7] leading-tight truncate">{d.nome}</div>
                          <div className={cn("text-[9px] mt-0.5 font-semibold",
                            sem ? "text-[#c11720]" : baixo ? "text-amber-400" : "text-emerald-400"
                          )}>
                            {sem ? "Esgotado" : `${d.estoque} un.`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
                <Field label="Quantidade (unidades)" value={qtd} onChange={setQtd} type="number" min="1" placeholder="1" />
              </div>

              <div className="flex justify-between">
                <Btn variant="outline" onClick={() => setStep(0)}><ArrowLeft size={13} /> Anterior</Btn>
                <Btn variant="primary" onClick={() => {
                  if (!liveSku) { toast.error("Selecione um produto (SKU)"); return; }
                  if (!liveDtf) { toast.error("Selecione um design DTF"); return; }
                  if (!prodSuficiente) {
                    toast.error(`Estoque do produto insuficiente (${liveSku.estoque} disponível).`);
                    return;
                  }
                  if (!dtfSuficiente) {
                    toast.error(`Estoque do DTF insuficiente (${liveDtf.estoque} disponível).`);
                    return;
                  }
                  setStep(2);
                }}>
                  Próximo <ArrowRight size={13} />
                </Btn>
              </div>
            </div>
          )}

          {/* Step 2: Payment */}
          {step === 2 && (
            <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-[#e8f0f7] mb-5">Forma de Pagamento</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                {[
                  { id: "pix", label: "PIX", sub: "Aprovação imediata", icon: <Zap size={17} /> },
                  { id: "cartao", label: "Cartão", sub: "Crédito / Débito", icon: <CreditCard size={17} /> },
                  { id: "boleto", label: "Boleto", sub: "Vence em 3 dias", icon: <Banknote size={17} /> },
                ].map((m) => (
                  <button key={m.id} onClick={() => setPagamento(m.id)}
                    className={cn("p-4 rounded-xl border text-left transition-all cursor-pointer",
                      pagamento === m.id ? "border-[#c11720] bg-[#c11720]/8" : "border-[#679bbc]/15 hover:border-[#679bbc]/35 hover:bg-[#679bbc]/5"
                    )}>
                    <div className={cn("mb-2", pagamento === m.id ? "text-[#c11720]" : "text-[#679bbc]")}>{m.icon}</div>
                    <div className="text-sm font-semibold text-[#e8f0f7]">{m.label}</div>
                    <div className="text-[10px] text-[#8fafc5] mt-0.5">{m.sub}</div>
                  </button>
                ))}
              </div>

              <div className="flex justify-between mt-2">
                <Btn variant="outline" onClick={() => setStep(1)}><ArrowLeft size={13} /> Anterior</Btn>
                <Btn variant="primary" onClick={finish}>
                  <Check size={13} /> Confirmar Pedido
                </Btn>
              </div>
            </div>
          )}
        </div>

        {/* Summary panel */}
        <div className="space-y-4">
          <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#e8f0f7] mb-4">Resumo do Pedido</h3>
            <div className="space-y-3 text-xs">
              {[
                { l: "Cliente", v: cliente || "—" },
                { l: "Produto", v: liveSku?.nome || "—" },
                { l: "SKU", v: liveSku?.sku || "—" },
                { l: "Design DTF", v: liveDtf?.nome || "—" },
                { l: "Quantidade", v: `${qty} un.` },
                { l: "Preço unit.", v: liveSku ? fmt(liveSku.preco) : "—" },
                { l: "Pagamento", v: pagamento === "pix" ? "PIX" : pagamento === "cartao" ? "Cartão" : "Boleto" },
              ].map((row) => (
                <div key={row.l} className="flex justify-between">
                  <span className="text-[#8fafc5]">{row.l}</span>
                  <span className="text-[#e8f0f7] font-medium text-right max-w-[140px] truncate">{row.v}</span>
                </div>
              ))}
              <div className="border-t border-[#679bbc]/12 pt-3 flex justify-between">
                <span className="text-[#8fafc5] font-semibold">Total</span>
                <span className="text-emerald-400 font-bold font-mono text-sm">{total > 0 ? fmt(total) : "—"}</span>
              </div>
            </div>
          </div>

          {liveSku && liveDtf && (
            <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#e8f0f7] mb-3">Preview Mockup</h3>
              <div className="aspect-square rounded-lg flex items-center justify-center bg-[#0b3048]/60 border border-[#679bbc]/10 overflow-hidden">
                <MockupCanvas design={liveDtf} color={mockupColor} />
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-[#8fafc5]">Cor da camiseta</span>
                <input type="color" value={mockupColor} onChange={(event) => setMockupColor(event.target.value)} className="h-7 w-12 bg-transparent cursor-pointer" />
              </div>
              <p className="text-[10px] text-[#8fafc5] text-center mt-2">{liveDtf.nome} · {liveSku.nome}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Produção Kanban ──────────────────────────────────────────────────────────
const COL_KEYS: ColKey[] = ["aguardando", "producao", "finalizado", "entregue"];
const COL_LABELS: Record<ColKey, string> = {
  aguardando: "Aguardando",
  producao: "Em Produção",
  finalizado: "Finalizado",
  entregue: "Entregue",
};
const COL_COLORS: Record<ColKey, string> = {
  aguardando: "#679bbc",
  producao: "#f59e0b",
  finalizado: "#10b981",
  entregue: "#8fafc5",
};

function ProducaoKanbanScreen({
  kanban,
  onMoveCard,
  onDeleteCard,
  onNav,
}: {
  kanban: KCols;
  onMoveCard: (id: string, from: ColKey, to: ColKey) => void;
  onDeleteCard: (id: string, col: ColKey) => void;
  onNav: (screen: string) => void;
}) {
  const [dragFrom, setDragFrom] = useState<{ id: string; col: ColKey } | null>(null);
  const [selectedCard, setSelectedCard] = useState<KCard | null>(null);

  function moveCard(id: string, from: ColKey, to: ColKey) {
    const card = kanban[from].find((c) => c.id === id);
    if (!card || from === to) return;
    onMoveCard(id, from, to);
    toast.success(`"${card.cliente}" → ${COL_LABELS[to]}`);
  }

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <PageHeader
        title="Produção Kanban"
        subtitle="Arraste os cards ou use os botões para avançar o status de produção"
        action={
          <Btn variant="primary" size="sm" onClick={() => onNav("pedido")}>
            <Plus size={12} /> Novo Pedido
          </Btn>
        }
      />
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
        {COL_KEYS.map((colKey) => (
          <div
            key={colKey}
            className="flex-shrink-0 w-[272px] flex flex-col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom && dragFrom.col !== colKey) {
                moveCard(dragFrom.id, dragFrom.col, colKey);
                setDragFrom(null);
              }
            }}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COL_COLORS[colKey] }} />
                <span className="text-[13px] font-semibold text-[#e8f0f7]">{COL_LABELS[colKey]}</span>
              </div>
              <span className="min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: COL_COLORS[colKey] }}>
                {kanban[colKey].length}
              </span>
            </div>

            <div className="flex-1 space-y-3 p-2 rounded-xl border border-dashed border-[#679bbc]/12 bg-[#0b3048]/20 overflow-y-auto min-h-[180px]">
              {kanban[colKey].map((card) => {
                const colIdx = COL_KEYS.indexOf(colKey);
                return (
                  <div
                    key={card.id}
                    draggable
                    onClick={() => setSelectedCard(card)}
                    onDragStart={() => setDragFrom({ id: card.id, col: colKey })}
                    onDragEnd={() => setDragFrom(null)}
                    className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[#679bbc]/35 transition-all hover:shadow-md select-none"
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-[12px] font-semibold text-[#e8f0f7] leading-tight flex-1 pr-2">{card.cliente}</span>
                      <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: COL_COLORS[colKey] }} />
                    </div>
                    <div className="text-[10px] text-[#8fafc5] mb-0.5">{card.produto}</div>
                    <div className="text-[10px] text-[#679bbc] mb-2.5">DTF: {card.dtf}</div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#679bbc]/10">
                      <span className="text-[10px] text-[#8fafc5]">{card.qtd} peças</span>
                      <div className="flex items-center gap-1 text-[10px]">
                        <Clock size={9} className="text-[#8fafc5]" />
                        <span className="text-[#8fafc5]">{card.prazo}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                      {colIdx > 0 && (
                        <button
                          onClick={() => moveCard(card.id, colKey, COL_KEYS[colIdx - 1])}
                          className="flex-1 py-1 rounded text-[10px] bg-[#0b3048] text-[#679bbc] hover:bg-[#679bbc]/15 transition-all flex items-center justify-center gap-0.5 cursor-pointer"
                        >
                          <ArrowLeft size={8} /> Retroceder
                        </button>
                      )}
                      {colIdx < COL_KEYS.length - 1 && (
                        <button
                          onClick={() => moveCard(card.id, colKey, COL_KEYS[colIdx + 1])}
                          className="flex-1 py-1 rounded text-[10px] bg-[#c11720]/10 text-[#c11720] hover:bg-[#c11720]/20 transition-all flex items-center justify-center gap-0.5 cursor-pointer"
                        >
                          Avançar <ArrowRight size={8} />
                        </button>
                      )}
                      <button
                        onClick={() => { if (window.confirm("Excluir este pedido?")) onDeleteCard(card.id, colKey); }}
                        className="w-7 py-1 rounded text-[10px] text-[#c11720] bg-[#c11720]/10 hover:bg-[#c11720]/20 transition-all flex items-center justify-center cursor-pointer"
                        title="Excluir pedido"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {kanban[colKey].length === 0 && (
                <div className="flex flex-col items-center justify-center h-28 text-center">
                  <div className="w-8 h-8 rounded-full bg-[#679bbc]/8 flex items-center justify-center mb-1.5">
                    <Check size={13} className="text-[#679bbc]/40" />
                  </div>
                  <p className="text-[11px] text-[#8fafc5]/40">Coluna vazia</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {selectedCard && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={() => setSelectedCard(null)}>
          <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#e8f0f7]" style={DISPLAY}>Detalhes do Pedido</h2>
              <button onClick={() => setSelectedCard(null)} className="text-[#8fafc5] cursor-pointer">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              {[
                ["Cliente", selectedCard.cliente],
                ["CPF/CNPJ", selectedCard.cpf_cnpj],
                ["Telefone", selectedCard.telefone],
                ["E-mail", selectedCard.email],
                ["Endereço", [selectedCard.endereco, selectedCard.cidade, selectedCard.uf, selectedCard.cep].filter(Boolean).join(", ")],
                ["Produto", selectedCard.produto],
                ["Design DTF", selectedCard.dtf],
                ["Quantidade", `${selectedCard.qtd} peças`],
                ["Valor Total", selectedCard.valor_total ? fmt(selectedCard.valor_total) : undefined],
                ["Pagamento", selectedCard.pagamento?.toUpperCase()],
                ["Prazo", selectedCard.prazo],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-[#679bbc]/10 pb-2">
                    <span className="text-[#8fafc5]">{label}</span>
                    <strong className="text-[#e8f0f7]">{value}</strong>
                  </div>
                ))}
            </div>
            <div className="flex justify-end mt-5">
              <Btn variant="outline" onClick={() => setSelectedCard(null)}>Fechar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Estoque ──────────────────────────────────────────────────────────────────
function EstoqueScreen({
  products,
  onAdjustStock,
}: {
  products: Product[];
  onAdjustStock: (productId: number, type: "entrada" | "saida", quantity: number, motivo: string) => Promise<boolean>;
}) {
  const [adjProd, setAdjProd] = useState("");
  const [adjQtd, setAdjQtd] = useState("");
  const [adjMotivo, setAdjMotivo] = useState("");
  const [adjType, setAdjType] = useState<"entrada" | "saida">("entrada");

  const totalPecas = products.reduce((sum, p) => sum + Number(p.estoque || 0), 0);
  const abaixoMinimo = products.filter((p) => Number(p.estoque) <= Number(p.estoque_minimo ?? 10)).length;
  const emConformidade = products.filter((p) => Number(p.estoque) > Number(p.estoque_minimo ?? 10)).length;
  const valorEstoque = products.reduce((sum, p) => sum + Number(p.custo || 0) * Number(p.estoque || 0), 0);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Estoque"
        subtitle="Posição atual e ajuste de inventário em tempo real"
        action={
          <div className="flex gap-2">
            <Btn
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "estoque.csv",
                  products.map((p) => ({
                    sku: p.sku,
                    produto: p.nome,
                    estoque: p.estoque,
                    minimo: p.estoque_minimo ?? 10,
                    custo: p.custo,
                    status: p.status,
                  }))
                )
              }
            >
              <Download size={12} /> Exportar CSV
            </Btn>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard icon={<Box size={15} />} label="Total de peças" value={String(totalPecas)} subtitle={`${products.length} SKU(s)`} up={totalPecas > 0} />
        <StatCard icon={<AlertTriangle size={15} />} label="Abaixo do mínimo" value={String(abaixoMinimo)} subtitle="Requer reposição" up={abaixoMinimo === 0} />
        <StatCard icon={<CheckCircle size={15} />} label="Em conformidade" value={String(emConformidade)} subtitle="Estoque saudável" up />
        <StatCard icon={<DollarSign size={15} />} label="Valor em estoque" value={fmt(valorEstoque)} subtitle="Custo total investido" up={valorEstoque > 0} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#679bbc]/12 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#e8f0f7]">Posição de Estoque</h3>
            <Badge variant="info">Tempo real</Badge>
          </div>
          {products.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8fafc5]">
              Nenhum produto cadastrado. Adicione produtos na aba <strong className="text-[#e8f0f7]">Produtos</strong>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#679bbc]/10 text-[#8fafc5] bg-[#0b3048]/20">
                    <th className="px-4 py-3 text-left font-medium">SKU / Produto</th>
                    <th className="px-4 py-3 text-center font-medium">Atual</th>
                    <th className="px-4 py-3 text-center font-medium">Mínimo</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Valor (Custo)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#679bbc]/8">
                  {products.map((p) => {
                    const min = p.estoque_minimo ?? 10;
                    const isLow = p.estoque <= min;
                    const isEmpty = p.estoque <= 0;
                    return (
                      <tr key={p.id} className="hover:bg-[#679bbc]/5 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-mono text-[#679bbc] text-[10px]">{p.sku}</div>
                          <div className="font-medium text-[#e8f0f7] mt-0.5">{p.nome}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("font-bold font-mono text-base", isEmpty ? "text-[#c11720]" : isLow ? "text-amber-400" : "text-emerald-400")}>
                            {p.estoque}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-[#8fafc5] font-mono">{min}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={isEmpty ? "danger" : isLow ? "warning" : "success"}>
                            {isEmpty ? "Esgotado" : isLow ? "Crítico" : "Normal"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[#e8f0f7]">{fmt(p.custo * p.estoque)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#e8f0f7] mb-5">Ajuste de Estoque</h3>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-semibold text-[#8fafc5] uppercase tracking-widest block mb-2">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {(["entrada", "saida"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAdjType(t)}
                    className={cn("py-2.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer",
                      adjType === t
                        ? t === "entrada" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "bg-[#c11720]/20 border-[#c11720]/40 text-[#c11720]"
                        : "border-[#679bbc]/15 text-[#8fafc5] hover:border-[#679bbc]/35"
                    )}
                  >
                    {t === "entrada" ? "Entrada  +" : "Saída  −"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#8fafc5] uppercase tracking-widest block mb-1.5">Produto</label>
              <select
                value={adjProd}
                onChange={(e) => setAdjProd(e.target.value)}
                className="w-full bg-[#0b3048]/50 border border-[#679bbc]/20 rounded-lg px-3 py-2.5 text-sm text-[#e8f0f7] focus:outline-none focus:border-[#679bbc]/60 transition-all"
              >
                <option value="" className="bg-[#0c1d2e]">Selecione o produto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0c1d2e]">
                    {p.nome} ({p.estoque} un.)
                  </option>
                ))}
              </select>
            </div>
            <Field label="Quantidade" value={adjQtd} onChange={setAdjQtd} type="number" min="1" placeholder="0" />
            <Field label="Motivo" value={adjMotivo} onChange={setAdjMotivo} placeholder="Ex: Compra fornecedor, Avaria..." />
            <Btn
              variant="primary"
              full
              onClick={async () => {
                const qty = parseInt(adjQtd);
                if (!adjProd || isNaN(qty) || qty < 1) {
                  toast.error("Selecione o produto e informe uma quantidade válida");
                  return;
                }
                const ok = await onAdjustStock(Number(adjProd), adjType, qty, adjMotivo);
                if (ok) {
                  setAdjProd("");
                  setAdjQtd("");
                  setAdjMotivo("");
                }
              }}
            >
              <Check size={14} /> Confirmar Ajuste
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Relatórios ───────────────────────────────────────────────────────────────
function RelatoriosScreen({
  products,
  orders,
  entries,
}: {
  products: Product[];
  orders: KCard[];
  entries: DashboardEntry[];
}) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "1a">("30d");

  const filteredRecords = useMemo(() => {
    const daysMap = { "7d": 7, "30d": 30, "90d": 90, "1a": 365 };
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysMap[period]);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const fromEntries = entries
      .filter((e) => (e.data || "").slice(0, 10) >= cutoffIso)
      .map((e) => ({
        dateIso: (e.data || getTodayIso()).slice(0, 10),
        receita: Number(e.receita || 0),
        pedidos: Number(e.pedidos || 1),
        status: e.status_pedido || "entregue",
        productId: e.product_id ? Number(e.product_id) : null,
        productName: e.produto_nome || null,
        pecas: Number(e.quantidade_pecas || 1),
      }));

    const fromOrders = orders
      .map((o) => ({
        dateIso: o.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : getTodayIso(),
        receita: Number(o.valor_total || 0),
        pedidos: 1,
        status: o.status || "aguardando",
        productId: o.product_id ? Number(o.product_id) : null,
        productName: o.produto || null,
        pecas: Number(o.qtd || 1),
      }))
      .filter((o) => o.dateIso >= cutoffIso);

    return [...fromEntries, ...fromOrders];
  }, [entries, orders, period]);

  const totalReceita = filteredRecords.reduce((s, r) => s + r.receita, 0);
  const totalPedidos = filteredRecords.reduce((s, r) => s + r.pedidos, 0);
  const totalEntregues = filteredRecords
    .filter((r) => r.status === "entregue" || r.status === "finalizado")
    .reduce((s, r) => s + r.pedidos, 0);
  const totalCancelados = filteredRecords
    .filter((r) => r.status === "cancelado")
    .reduce((s, r) => s + r.pedidos, 0);

  const currentYear = new Date().getFullYear();
  const monthlySeries = useMemo(() => {
    return MONTHS_SHORT.map((mes, idx) => {
      const recs = filteredRecords.filter((r) => Number(r.dateIso.slice(5, 7)) - 1 === idx);
      return {
        mes,
        receita: recs.reduce((s, r) => s + r.receita, 0),
        pedidos: recs.reduce((s, r) => s + r.pedidos, 0),
      };
    });
  }, [filteredRecords]);

  const productPerf = useMemo(() => {
    return products
      .map((p) => {
        const recs = filteredRecords.filter(
          (r) => r.productId === p.id || (r.productName && r.productName.toLowerCase() === p.nome.toLowerCase())
        );
        const vendas = recs.reduce((s, r) => s + r.pecas, 0);
        const receita = recs.reduce((s, r) => s + r.receita, 0);
        return {
          nome: p.nome,
          sku: p.sku,
          vendas,
          receita,
          ticket: vendas > 0 ? receita / vendas : p.preco,
        };
      })
      .sort((a, b) => b.receita - a.receita);
  }, [products, filteredRecords]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Relatórios"
        subtitle={`Análise de vendas e desempenho operacional — ${ currentYear }`}
        action={
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-0.5 bg-[#0b3048]/50 p-1 rounded-lg">
              {(
                [
                  { id: "7d", l: "7d" },
                  { id: "30d", l: "30d" },
                  { id: "90d", l: "90d" },
                  { id: "1a", l: "1a" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                    period === p.id ? "bg-[#c11720] text-white" : "text-[#8fafc5] hover:text-[#e8f0f7]"
                  )}
                >
                  {p.l}
                </button>
              ))}
            </div>
            <Btn
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "relatorio-vendas.csv",
                  productPerf.map((p) => ({
                    produto: p.nome,
                    sku: p.sku,
                    vendas: p.vendas,
                    receita: p.receita,
                  }))
                )
              }
            >
              <Download size={12} /> Exportar CSV
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => window.print()}>
              <Download size={12} /> Exportar PDF
            </Btn>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign size={15} />} label="Receita no período" value={fmt(totalReceita)} subtitle={`Filtro: ${period}`} up={totalReceita > 0} />
        <StatCard icon={<ShoppingCart size={15} />} label="Total pedidos" value={String(totalPedidos)} subtitle={`Filtro: ${period}`} up={totalPedidos > 0} />
        <StatCard icon={<Truck size={15} />} label="Concluídos / Entregues" value={String(totalEntregues)} subtitle="Pedidos finalizados" up />
        <StatCard icon={<AlertCircle size={15} />} label="Cancelados" value={String(totalCancelados)} subtitle="No período" up={totalCancelados === 0} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#e8f0f7] mb-5">Evolução da Receita</h3>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={monthlySeries} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(103,155,188,0.07)" />
              <XAxis dataKey="mes" tick={{ fill: "#8fafc5", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8fafc5", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="receita" name="receita" stroke="#c11720" strokeWidth={2} fill="#c11720" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#e8f0f7] mb-5">Pedidos por Mês</h3>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={monthlySeries} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(103,155,188,0.07)" />
              <XAxis dataKey="mes" tick={{ fill: "#8fafc5", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#8fafc5", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="pedidos" name="Pedidos" fill="#679bbc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#679bbc]/12">
          <h3 className="text-sm font-semibold text-[#e8f0f7]">Desempenho por Produto</h3>
        </div>
        {productPerf.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#8fafc5]">
            Cadastre produtos e registre lançamentos ou pedidos para visualizar o desempenho detalhado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#679bbc]/10 text-[#8fafc5] bg-[#0b3048]/20">
                  <th className="px-4 py-3 text-left font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">Produto</th>
                  <th className="px-4 py-3 text-right font-medium">Vendas</th>
                  <th className="px-4 py-3 text-right font-medium">Receita</th>
                  <th className="px-4 py-3 text-right font-medium">Ticket médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#679bbc]/8">
                {productPerf.map((p, i) => (
                  <tr key={p.sku} className="hover:bg-[#679bbc]/5 transition-colors">
                    <td className="px-4 py-3 text-[#8fafc5] font-bold">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#e8f0f7]">{p.nome}</div>
                      <div className="text-[#8fafc5] font-mono text-[10px]">{p.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#e8f0f7]">{p.vendas}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmt(p.receita)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#679bbc]">{fmt(p.ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Admin ────────────────────────────────────────────────────────────────────
function AdminScreen({ activities }: { activities: ActivityItem[] }) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [tab, setTab] = useState("usuários");
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [userForm, setUserForm] = useState({ nome: "", email: "", cargo: "Operador", password: "", status: "Ativo" });
  const [automations, setAutomations] = useState({ backup_enabled: true, report_enabled: false });

  useEffect(() => {
    fetch("/api/users")
      .then((response) => (response.ok ? response.json() : []))
      .then(setUsers)
      .catch(() =>
        setUsers([
          {
            id: 1,
            nome: "Ana Costa",
            email: "ana@lambstore.com.br",
            cargo: "Admin",
            status: "Ativo",
            ultimo: new Date().toLocaleString("pt-BR"),
          },
        ])
      );
    fetch("/api/settings/automations")
      .then((response) => (response.ok ? response.json() : { backup_enabled: true, report_enabled: false }))
      .then(setAutomations)
      .catch(() => {});
  }, []);

  async function toggleAutomation(key: "backup_enabled" | "report_enabled") {
    const next = { ...automations, [key]: !automations[key] };
    try {
      const response = await fetch("/api/settings/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupEnabled: next.backup_enabled, reportEnabled: next.report_enabled }),
      });
      if (response.ok) {
        setAutomations(await response.json());
        toast.success("Automação atualizada");
        return;
      }
    } catch {
      // fallback
    }
    setAutomations(next);
    toast.success("Automação atualizada");
  }

  function openUserModal(user?: SystemUser) {
    setEditingUser(user || null);
    setUserForm(
      user
        ? { nome: user.nome, email: user.email, cargo: user.cargo, password: "", status: user.status }
        : { nome: "", email: "", cargo: "Operador", password: "", status: "Ativo" }
    );
    setUserModal(true);
  }

  async function saveUser() {
    if (!userForm.nome || !userForm.email || (!editingUser && !userForm.password)) {
      toast.error("Preencha nome, e-mail e senha");
      return;
    }
    try {
      const response = await fetch(editingUser ? `/api/users/${editingUser.id}` : "/api/users", {
        method: editingUser ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error || "Não foi possível salvar o usuário");
        return;
      }
      setUsers((prev) => (editingUser ? prev.map((user) => (user.id === body.id ? body : user)) : [...prev, body]));
      setUserModal(false);
      toast.success(editingUser ? "Perfil atualizado" : "Usuário cadastrado");
    } catch {
      toast.error("Erro ao salvar usuário");
    }
  }

  async function toggleStatus(user: SystemUser) {
    const status = user.status === "Ativo" ? "Inativo" : "Ativo";
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: user.nome, email: user.email, cargo: user.cargo, status }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error || "Não foi possível atualizar o status");
        return;
      }
      setUsers((prev) => prev.map((item) => (item.id === user.id ? body : item)));
      toast.success("Status do usuário atualizado");
    } catch {
      toast.error("Erro ao atualizar status");
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Administração" subtitle="Gestão de usuários, permissões e configurações" />

      <TabStrip tabs={["usuários", "logs", "configurações"]} active={tab} onChange={setTab} />

      {tab === "usuários" && (
        <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#679bbc]/12 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#e8f0f7]">Usuários do Sistema</h3>
            <Btn variant="primary" size="sm" onClick={() => openUserModal()}>
              <Plus size={12} /> Convidar usuário
            </Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#679bbc]/10 text-[#8fafc5] bg-[#0b3048]/20">
                  <th className="px-4 py-3 text-left font-medium">Usuário</th>
                  <th className="px-4 py-3 text-left font-medium">Cargo</th>
                  <th className="px-4 py-3 text-left font-medium">Último acesso</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#679bbc]/8">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#679bbc]/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#679bbc]/15 flex items-center justify-center flex-shrink-0">
                          <User size={13} className="text-[#679bbc]" />
                        </div>
                        <div>
                          <div className="font-semibold text-[#e8f0f7]">{u.nome}</div>
                          <div className="text-[#8fafc5]">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.cargo === "Admin" ? "danger" : u.cargo === "Financeiro" ? "warning" : "info"}>
                        {u.cargo}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#8fafc5]">{u.ultimo || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={u.status === "Ativo" ? "success" : "muted"}>{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => toggleStatus(u)}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border cursor-pointer",
                            u.status === "Ativo"
                              ? "border-[#c11720]/30 bg-[#c11720]/10 text-[#c11720] hover:bg-[#c11720]/20"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          )}
                        >
                          {u.status === "Ativo" ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          onClick={() => openUserModal(u)}
                          className="w-6 h-6 rounded flex items-center justify-center text-[#679bbc] hover:bg-[#679bbc]/15 transition-all cursor-pointer"
                        >
                          <Edit size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "logs" && (
        <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#679bbc]/12 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#e8f0f7]">
              Log de Atividades — {new Date().toLocaleDateString("pt-BR")}
            </h3>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "logs-atividades.csv",
                  activities.map((a) => ({ usuario: a.user, acao: a.action, data: a.date, hora: a.time }))
                )
              }
            >
              <Download size={12} /> Exportar log
            </Btn>
          </div>
          {activities.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8fafc5]">
              Nenhuma atividade registrada nesta sessão ainda.
            </div>
          ) : (
            <div className="divide-y divide-[#679bbc]/8">
              {activities.map((log) => (
                <div key={log.id} className="px-5 py-3.5 flex items-start gap-4 hover:bg-[#679bbc]/5 transition-colors">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                      log.type === "create"
                        ? "bg-emerald-400"
                        : log.type === "update"
                        ? "bg-[#679bbc]"
                        : log.type === "stock"
                        ? "bg-amber-400"
                        : "bg-[#8fafc5]/50"
                    )}
                  />
                  <div className="flex-1 min-w-0 text-xs">
                    <span className="font-semibold text-[#679bbc]">{log.user}</span>
                    <span className="text-[#8fafc5] ml-2">{log.action}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#8fafc5]/50 flex-shrink-0">{log.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "configurações" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#e8f0f7] mb-5">Dados da Empresa</h3>
            <div className="space-y-4">
              <Field label="Nome fantasia" value="Lamb Store" />
              <Field label="CNPJ" value="00.000.000/0001-00" />
              <Field label="E-mail comercial" value="contato@lambstore.com.br" />
              <Field label="Telefone" value="(11) 99000-0000" />
              <Btn variant="primary" size="sm" onClick={() => toast.success("Dados da empresa salvos com sucesso!")}>
                <Check size={13} /> Salvar alterações
              </Btn>
            </div>
          </div>
          <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#e8f0f7] mb-5">Automações do Sistema</h3>
            <div className="space-y-0">
              {[
                { label: "Alertas de estoque crítico", sub: "Notifica quando abaixo do mínimo", key: null, on: true },
                { label: "Backup automático", sub: "Diário às 08:00h", key: "backup_enabled" as const, on: automations.backup_enabled },
                { label: "Relatório semanal por e-mail", sub: "Toda segunda-feira às 09:00h", key: "report_enabled" as const, on: automations.report_enabled },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between py-3.5 border-b border-[#679bbc]/8 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-[#e8f0f7]">{s.label}</div>
                    <div className="text-[10px] text-[#8fafc5] mt-0.5">{s.sub}</div>
                  </div>
                  <button
                    onClick={() => (s.key ? toggleAutomation(s.key) : toast.info("Automação ativa"))}
                    className={cn(
                      "w-9 h-5 rounded-full relative transition-all flex-shrink-0 cursor-pointer",
                      s.on ? "bg-[#c11720]" : "bg-[#0b3048] border border-[#679bbc]/25"
                    )}
                  >
                    <div
                      className={cn(
                        "w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all shadow-xs",
                        s.on ? "right-0.5" : "left-0.5"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {userModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c1d2e] border border-[#679bbc]/15 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#e8f0f7]" style={DISPLAY}>
                {editingUser ? "Editar Perfil" : "Cadastrar Usuário"}
              </h2>
              <button onClick={() => setUserModal(false)} className="text-[#8fafc5] cursor-pointer">✕</button>
            </div>
            <div className="space-y-3">
              <Field label="Nome" value={userForm.nome} onChange={(value) => setUserForm({ ...userForm, nome: value })} />
              <Field label="E-mail" type="email" value={userForm.email} onChange={(value) => setUserForm({ ...userForm, email: value })} />
              <Field label={editingUser ? "Nova senha (opcional)" : "Senha"} type="password" value={userForm.password} onChange={(value) => setUserForm({ ...userForm, password: value })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cargo" value={userForm.cargo} onChange={(value) => setUserForm({ ...userForm, cargo: value })} />
                <Field label="Status" value={userForm.status} onChange={(value) => setUserForm({ ...userForm, status: value })} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Btn variant="ghost" onClick={() => setUserModal(false)}>Cancelar</Btn>
              <Btn variant="primary" onClick={saveUser}>Salvar Perfil</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
const EMPTY_KANBAN: KCols = {
  aguardando: [],
  producao: [],
  finalizado: [],
  entregue: [],
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [screen, setScreen] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  // All states start clean (zero mocked items)
  const [products, setProducts] = useState<Product[]>(() => readStorage("lamb_products_v2", []));
  const [dtfDesigns, setDtfDesigns] = useState<DTFDesign[]>(() => readStorage("lamb_designs_v2", []));
  const [orders, setOrders] = useState<KCard[]>(() => readStorage("lamb_orders_v2", []));
  const [entries, setEntries] = useState<DashboardEntry[]>(() => readStorage("lamb_entries_v2", []));
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  function logAction(action: string, type: ActivityItem["type"] = "create") {
    const now = new Date();
    setActivities((prev) => [
      {
        id: Date.now() + Math.random(),
        user: currentUser?.nome || "Ana Costa",
        action,
        time: now.toLocaleTimeString("pt-BR"),
        date: now.toLocaleDateString("pt-BR"),
        type,
      },
      ...prev,
    ]);
  }

  // Sync to localStorage whenever state updates
  useEffect(() => { writeStorage("lamb_products_v2", products); }, [products]);
  useEffect(() => { writeStorage("lamb_designs_v2", dtfDesigns); }, [dtfDesigns]);
  useEffect(() => { writeStorage("lamb_orders_v2", orders); }, [orders]);
  useEffect(() => { writeStorage("lamb_entries_v2", entries); }, [entries]);

  // Fetch initial data from backend API
  useEffect(() => {
    if (!currentUser) return;

    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (Array.isArray(data)) setProducts(data); })
      .catch(() => {});

    fetch("/api/designs")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (Array.isArray(data)) setDtfDesigns(data); })
      .catch(() => {});

    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          setOrders(data.map((o: KCard) => ({ ...o, id: String(o.id) })));
        }
      })
      .catch(() => {});

    fetch("/api/dashboard/entries")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (Array.isArray(data)) setEntries(data); })
      .catch(() => {});
  }, [currentUser]);

  // Kanban derived from orders
  const kanban = useMemo<KCols>(() => {
    return {
      aguardando: orders.filter((o) => (o.status || "aguardando") === "aguardando"),
      producao: orders.filter((o) => o.status === "producao"),
      finalizado: orders.filter((o) => o.status === "finalizado"),
      entregue: orders.filter((o) => o.status === "entregue"),
    };
  }, [orders]);

  // ─── Product CRUD Handlers ──────────────────────────────────────────────────
  async function handleCreateProduct(payload: Omit<Product, "id">): Promise<Product | null> {
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error || "Erro ao cadastrar produto");
        return null;
      }
      setProducts((prev) => [body, ...prev]);
      logAction(`Cadastrou produto "${body.nome}" (${body.sku})`, "create");
      toast.success(`Produto "${body.nome}" cadastrado com sucesso!`);
      return body;
    } catch {
      const localProd: Product = { id: Date.now(), ...payload };
      setProducts((prev) => [localProd, ...prev]);
      logAction(`Cadastrou produto "${localProd.nome}" (${localProd.sku})`, "create");
      toast.success(`Produto "${localProd.nome}" cadastrado localmente!`);
      return localProd;
    }
  }

  async function handleUpdateProduct(id: number, payload: Omit<Product, "id">): Promise<Product | null> {
    try {
      const response = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error || "Erro ao atualizar produto");
        return null;
      }
      setProducts((prev) => prev.map((p) => (p.id === id ? body : p)));
      logAction(`Atualizou produto "${body.nome}"`, "update");
      toast.success(`Produto "${body.nome}" atualizado!`);
      return body;
    } catch {
      const updated: Product = { id, ...payload };
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      logAction(`Atualizou produto "${updated.nome}"`, "update");
      toast.success(`Produto "${updated.nome}" atualizado localmente!`);
      return updated;
    }
  }

  async function handleDeleteProduct(id: number): Promise<boolean> {
    const target = products.find((p) => p.id === id);
    try {
      const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("Não foi possível excluir o produto");
        return false;
      }
    } catch {
      // allow local deletion
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    logAction(`Removeu produto "${target?.nome || id}"`, "update");
    toast.success("Produto excluído com sucesso");
    return true;
  }

  async function handleAdjustStock(
    productId: number,
    type: "entrada" | "saida",
    quantity: number,
    motivo: string
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/products/${productId}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, quantity, motivo }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error || "Não foi possível ajustar o estoque");
        return false;
      }
      setProducts((prev) => prev.map((p) => (p.id === productId ? body : p)));
      logAction(
        `Ajustou estoque de ${body.sku} (${type === "entrada" ? "+" : "-"}${quantity} un.)`,
        "stock"
      );
      toast.success(`Estoque de "${body.nome}" atualizado!`);
      return true;
    } catch {
      const prod = products.find((p) => p.id === productId);
      if (!prod) return false;
      if (type === "saida" && prod.estoque < quantity) {
        toast.error("Estoque insuficiente para saída");
        return false;
      }
      const nextEstoque = type === "entrada" ? prod.estoque + quantity : prod.estoque - quantity;
      const nextStatus = computeProductStatus(nextEstoque, prod.estoque_minimo ?? 10);
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, estoque: nextEstoque, status: nextStatus } : p))
      );
      toast.success(`Estoque de "${prod.nome}" atualizado localmente!`);
      return true;
    }
  }

  // ─── DTF Handlers ───────────────────────────────────────────────────────────
  async function updateDTFStock(id: number, newQty: number) {
    const cleanQty = Math.max(0, newQty);
    setDtfDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, estoque: cleanQty } : d)));
    try {
      await fetch(`/api/designs/${id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estoque: cleanQty }),
      });
      toast.success(`Estoque do design atualizado para ${cleanQty} un.`);
    } catch {
      toast.success(`Estoque do design atualizado localmente para ${cleanQty} un.`);
    }
  }

  async function handleDeleteDTF(id: number) {
    try {
      await fetch(`/api/designs/${id}`, { method: "DELETE" });
    } catch {
      // fallback
    }
    setDtfDesigns((prev) => prev.filter((d) => d.id !== id));
    toast.success("Design DTF excluído");
  }

  // ─── Dashboard Entries Handlers ─────────────────────────────────────────────
  async function handleAddDashboardEntry(payload: Omit<DashboardEntry, "id">) {
    try {
      const response = await fetch("/api/dashboard/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const created = await response.json();
        setEntries((prev) => [created, ...prev]);
        logAction(`Lançou receita no Dashboard (${fmt(created.receita)})`, "create");
        return;
      }
    } catch {
      // fallback local
    }
    const localEntry: DashboardEntry = { id: Date.now(), ...payload };
    setEntries((prev) => [localEntry, ...prev]);
    logAction(`Lançou receita no Dashboard (${fmt(localEntry.receita)})`, "create");
  }

  async function handleUpdateDashboardEntry(id: number, payload: Omit<DashboardEntry, "id">) {
    try {
      const response = await fetch(`/api/dashboard/entries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const updated = await response.json();
        setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        return;
      }
    } catch {
      // fallback
    }
    setEntries((prev) => prev.map((e) => (e.id === id ? { id, ...payload } : e)));
  }

  async function handleDeleteDashboardEntry(id: number) {
    try {
      await fetch(`/api/dashboard/entries/${id}`, { method: "DELETE" });
    } catch {
      // fallback
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast.success("Lançamento removido do Dashboard");
  }

  // ─── Orders / Kanban Handlers ───────────────────────────────────────────────
  function handleOrderCreated(card: KCard, productId: number, dtfId: number, qty: number) {
    setOrders((prev) => [{ ...card, status: "aguardando" }, ...prev]);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const nextStock = Math.max(0, p.estoque - qty);
        return { ...p, estoque: nextStock, status: computeProductStatus(nextStock, p.estoque_minimo ?? 10) };
      })
    );
    setDtfDesigns((prev) =>
      prev.map((d) => (d.id === dtfId ? { ...d, estoque: Math.max(0, d.estoque - qty) } : d))
    );
    logAction(`Criou pedido para "${card.cliente}" (${qty} peças)`, "create");
  }

  function moveKanbanCard(id: string, from: ColKey, to: ColKey) {
    if (from === to) return;
    setOrders((prev) => prev.map((o) => (String(o.id) === String(id) ? { ...o, status: to } : o)));
    fetch(`/api/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: to }),
    }).catch(() => {});
    logAction(`Moveu pedido #${id} para ${COL_LABELS[to]}`, "update");
  }

  async function deleteKanbanCard(id: string) {
    try {
      await fetch(`/api/orders/${id}`, { method: "DELETE" });
    } catch {
      // fallback
    }
    setOrders((prev) => prev.filter((o) => String(o.id) !== String(id)));
    toast.success("Pedido excluído");
  }

  const totalStock = products.reduce((s, p) => s + Number(p.estoque || 0), 0);
  const criticalCount =
    products.filter((p) => Number(p.estoque) <= Number(p.estoque_minimo ?? 10)).length +
    dtfDesigns.filter((d) => Number(d.estoque) <= 10).length;

  const currentMonthPrefix = getTodayIso().slice(0, 7);
  const currentMonthRevenue =
    entries
      .filter((e) => (e.data || "").startsWith(currentMonthPrefix))
      .reduce((s, e) => s + Number(e.receita || 0), 0) +
    orders
      .filter((o) => (o.created_at || "").startsWith(currentMonthPrefix))
      .reduce((s, o) => s + Number(o.valor_total || 0), 0);

  if (!currentUser) {
    return (
      <>
        <Toaster position="top-right" theme="dark" richColors />
        <AuthScreen
          onLogin={(u) => setCurrentUser(u)}
          totalStock={totalStock}
          totalOrders={orders.length}
          totalDesigns={dtfDesigns.length}
          currentMonthRevenue={currentMonthRevenue}
        />
      </>
    );
  }

  const screens: Record<string, ReactNode> = {
    dashboard: (
      <DashboardScreen
        products={products}
        dtfDesigns={dtfDesigns}
        orders={orders}
        entries={entries}
        onAddEntry={handleAddDashboardEntry}
        onUpdateEntry={handleUpdateDashboardEntry}
        onDeleteEntry={handleDeleteDashboardEntry}
        onQuickRestockProduct={(id, addQty) =>
          handleAdjustStock(id, "entrada", addQty, "Reposição rápida via Dashboard")
        }
        onQuickRestockDTF={updateDTFStock}
        onNav={setScreen}
      />
    ),
    produtos: (
      <ProdutosScreen
        products={products}
        onCreateProduct={handleCreateProduct}
        onUpdateProduct={handleUpdateProduct}
        onDeleteProduct={handleDeleteProduct}
        onNav={setScreen}
        initialSearch={globalSearch}
      />
    ),
    dtf: (
      <BancoDTFScreen
        designs={dtfDesigns}
        onUpdateStock={updateDTFStock}
        onDesignCreated={(design) => setDtfDesigns((prev) => [design, ...prev])}
        onDesignUpdated={(design) =>
          setDtfDesigns((prev) => prev.map((d) => (d.id === design.id ? design : d)))
        }
        onDeleteDesign={handleDeleteDTF}
      />
    ),
    pedido: (
      <CriarPedidoScreen
        products={products}
        designs={dtfDesigns}
        onOrderCreated={handleOrderCreated}
        onNav={setScreen}
      />
    ),
    kanban: (
      <ProducaoKanbanScreen
        kanban={kanban ?? EMPTY_KANBAN}
        onMoveCard={moveKanbanCard}
        onDeleteCard={(id) => deleteKanbanCard(id)}
        onNav={setScreen}
      />
    ),
    estoque: <EstoqueScreen products={products} onAdjustStock={handleAdjustStock} />,
    relatorios: <RelatoriosScreen products={products} orders={orders} entries={entries} />,
    admin: <AdminScreen activities={activities} />,
  };

  return (
    <div className="flex h-screen bg-[#070e17] overflow-hidden">
      <Toaster position="top-right" theme="dark" richColors />
      <Sidebar
        active={screen}
        onNav={setScreen}
        onLogout={() => {
          setApiToken(null);
          setCurrentUser(null);
        }}
        currentUser={currentUser}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar
          onNav={setScreen}
          onOpenMobile={() => setMobileMenuOpen(true)}
          criticalCount={criticalCount}
          globalSearch={globalSearch}
          onGlobalSearch={setGlobalSearch}
        />
        <main className="flex-1 overflow-auto">
          {screens[screen] ?? screens.dashboard}
        </main>
      </div>
    </div>
  );
}
