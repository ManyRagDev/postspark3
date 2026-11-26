import { PLAN_CHANGE_STORAGE_KEY, BEFORE_PLAN_CHANGE_EVENT } from "@/lib/sessionPlanEvents";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearCatalogCache } from "@/lib/catalogCache";
import { refreshBridgeFromCurrentSession } from "@/lib/authBridge";
import { isTheVoidLabSearch, studioLibraryPath, THEVOID_LAB_PATH } from "@/lib/studioRoutes";
import { useMobileEditorUI } from "@/store/mobileEditorUI";
import { supabase } from "@/lib/supabaseClient";
import { trpc } from "@/lib/trpc";
import { Bookmark, Building2, ChevronDown, Clock, Crown, FlaskConical, Loader2, LogOut, Phone, Settings, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { PAID_PLAN_OFFERS, type PaidStudioPlan } from "@shared/membership";

function getInitials(name: string | null, email: string | null) {
  const base = (name ?? email ?? "").trim();
  if (!base) return "U";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

interface UserTopMenuProps {
  /**
   * "floating" (padrão): ancorado fixo no canto superior direito da tela.
   * "inline": apenas o gatilho + dropdown, para embutir num header (ex.: editor mobile).
   */
  variant?: "floating" | "inline";
  compactMobile?: boolean;
}

export default function UserTopMenu({ variant = "floating", compactMobile = false }: UserTopMenuProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const immersiveEditor = useMobileEditorUI((s) => s.immersive);
  const utils = trpc.useUtils();
  const [location, setLocation] = useLocation();
  const impersonate = trpc.auth.impersonatePlan.useMutation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");

  const openStudioLibrary = (path: "/history" | "/saved-posts") => {
    const fromLab = location === THEVOID_LAB_PATH ||
      ((location === "/history" || location === "/saved-posts") && isTheVoidLabSearch(window.location.search));
    setLocation(studioLibraryPath(path, fromLab));
  };

  const scopedAccess = Boolean(user?.access);
  const { data: billing } = trpc.billing.getProfile.useQuery(undefined, {
    enabled: isAuthenticated && user?.access !== "agency",
    staleTime: 15_000,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });
  const { data: savedPosts } = trpc.post.listSummary.useQuery(undefined, {
    enabled: isAuthenticated && !scopedAccess,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setCompany(user.company ?? "");
  }, [user, profileOpen]);

  const initials = useMemo(() => getInitials(user?.name ?? null, user?.email ?? null), [user?.name, user?.email]);

  const handleOpenProfile = () => {
    setProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);

      if (!supabase) {
        throw new Error("Supabase client is not configured");
      }

      const normalizedName = name.trim();
      const normalizedPhone = phone.trim();
      const normalizedCompany = company.trim();

      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: normalizedName.length > 0 ? normalizedName : null,
          phone: normalizedPhone.length > 0 ? normalizedPhone : null,
          company: normalizedCompany.length > 0 ? normalizedCompany : null,
        },
      });

      if (error) {
        throw error;
      }

      await refreshBridgeFromCurrentSession();
      await Promise.all([utils.auth.me.invalidate(), utils.billing.getProfile.invalidate()]);
      toast.success("Perfil atualizado com sucesso.");
      setProfileOpen(false);
    } catch (error) {
      console.error("[Profile] update failed:", error);
      toast.error("Não foi possível salvar seu perfil agora.");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  const currentPlan = user.impersonatedPlan;
  const testingLabel = currentPlan ? PAID_PLAN_OFFERS[currentPlan].name : undefined;
  const switchPlan = async (plan: PaidStudioPlan | null) => {
    if (impersonate.isPending || (currentPlan ?? null) === plan) return;
    if (!window.dispatchEvent(new Event(BEFORE_PLAN_CHANGE_EVENT, { cancelable: true }))) return;
    try {
      await impersonate.mutateAsync({ plan });
      await clearCatalogCache();
      // Other tabs refresh their permissions while retaining their current document.
      try { localStorage.setItem(PLAN_CHANGE_STORAGE_KEY, JSON.stringify([user.id, Date.now()])); } catch {}
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o perfil desta sessão.");
    }
  };

  const isInline = variant === "inline";
  const lowBalance = billing?.plan === "PRO_PLUS" && billing.sparks <= PAID_PLAN_OFFERS.PRO_PLUS.sparksPerMonth * 0.2;

  // O editor mobile imersivo usa o menu inline no cabeçalho.
  if (!isInline && immersiveEditor) {
    return null;
  }

  const trigger = isInline ? (
    <button
      aria-label={testingLabel ? `Conta do Usuário · Impersonando ${testingLabel}` : "Conta do Usuário"}
      className="flex items-center justify-center gap-2 px-2 py-1 rounded-full border transition-all active:scale-95 cursor-pointer hover:bg-white/10 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 md:px-2.5 md:py-1"
      style={{
        background: "rgba(255, 255, 255, 0.06)",
        borderColor: "rgba(255, 255, 255, 0.12)",
        color: "oklch(0.92 0.01 280)",
      }}
    >
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-white/10 border border-white/15">
        {initials}
      </div>
      <span className={`hidden sm:inline text-xs font-semibold ${lowBalance ? "text-amber-200" : "text-white/90"}`}>
        {billing ? `${billing.sparks.toLocaleString("pt-BR")} ✦` : "Conta"}
      </span>
      {testingLabel && <span className="text-xs font-semibold text-amber-200">Teste · {testingLabel}</span>}
      <ChevronDown size={12} className={compactMobile ? "hidden opacity-60 sm:block" : "opacity-60"} />
    </button>
  ) : (
    <button
      aria-label={testingLabel ? `Conta do Usuário · Impersonando ${testingLabel}` : "Conta do Usuário"}
      className="flex min-h-11 min-w-11 items-center gap-2.5 px-3 py-2 rounded-full border transition-all hover:scale-[1.02] cursor-pointer"
      style={{
        background: "oklch(0.12 0.03 280 / 84%)",
        borderColor: "oklch(0.7 0.22 40 / 22%)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        color: "oklch(0.92 0.01 280)",
        boxShadow: "0 10px 30px oklch(0 0 0 / 35%)",
      }}
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border border-white/15 bg-white/10">
        {initials}
      </div>
      <div className="hidden sm:flex flex-col items-start min-w-0">
        <span className="text-xs font-semibold truncate max-w-[120px]">
          {user.name ?? user.email ?? "Conta"}
        </span>
        <span className="text-[10px] opacity-75">
          {billing ? `${billing.plan === "PRO_PLUS" ? "PRO+" : billing.plan} · ${billing.sparks.toLocaleString("pt-BR")} ✦` : "Conta"}
          {lowBalance && <span className="ml-1 text-amber-200">Saldo baixo</span>}
        </span>
      </div>
      {testingLabel && <span className="text-xs font-semibold text-amber-200">Teste · {testingLabel}</span>}
      <ChevronDown size={14} className="opacity-80" />
    </button>
  );

  return (
    <>
      <div className={isInline ? "relative shrink-0" : "fixed top-[max(0.875rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] md:right-[max(1.5rem,env(safe-area-inset-right))] z-[80]"}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {trigger}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-1rem)] overscroll-contain [@media(pointer:coarse)]:[&_[role=menuitem]]:min-h-11">
            <DropdownMenuLabel className="space-y-1">
              <p className="text-sm font-semibold truncate">{user.name ?? "Usuário"}</p>
              <p className="text-xs font-normal text-muted-foreground truncate">{user.email ?? "Sem e-mail"}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Crown size={14} />
                Plano atual
              </span>
              <span className="text-xs font-semibold">{billing?.plan ?? "FREE"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Settings size={14} />
                Sparks
              </span>
              <span className="text-xs font-semibold">{(billing?.sparks ?? 0).toLocaleString("pt-BR")} ✦</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleOpenProfile}>
              <UserRound size={14} />
              Meu perfil
            </DropdownMenuItem>
            {!scopedAccess && <>
            <DropdownMenuItem onClick={() => openStudioLibrary("/saved-posts")} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Bookmark size={14} />
                Posts salvos
              </span>
              <span className="text-xs font-semibold">{savedPosts?.total ?? 0}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openStudioLibrary("/history")} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock size={14} />
                Histórico
              </span>
            </DropdownMenuItem>
            </>}
            {user.studioPlan === "AGENCY" && <DropdownMenuItem onClick={() => setLocation("/agency")}>
              <Building2 size={14} />
              Projetos de equipe
            </DropdownMenuItem>}
            {lowBalance && <DropdownMenuItem onClick={() => setLocation("/billing")} className="text-amber-200">
              Saldo baixo · consultar próxima cota
            </DropdownMenuItem>}
            {user.access !== "agency" && <DropdownMenuItem onClick={() => setLocation("/billing")}>
              <Settings size={14} />
              Configurações e plano
            </DropdownMenuItem>}
            {user.canImpersonate && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={impersonate.isPending}>
                  <FlaskConical size={14} />
                  Impersonar
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="min-w-40 [@media(pointer:coarse)]:[&_[role=menuitemradio]]:min-h-11">
                    <DropdownMenuRadioGroup value={currentPlan ?? "real"}>
                      <DropdownMenuRadioItem value="real" onSelect={() => void switchPlan(null)}>
                        Meu perfil real
                      </DropdownMenuRadioItem>
                      <DropdownMenuSeparator />
                      {(Object.keys(PAID_PLAN_OFFERS) as PaidStudioPlan[]).map(plan => (
                        <DropdownMenuRadioItem key={plan} value={plan} onSelect={() => void switchPlan(plan)}>
                          {PAID_PLAN_OFFERS[plan].name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/privacy")}>
              Privacidade
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/terms")}>
              Termos de Uso
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/cookies")}>
              Cookies
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/privacy-settings")}>
              Meus Dados
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} variant="destructive">
              <LogOut size={14} />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meu perfil</DialogTitle>
            <DialogDescription>
              Complete apenas o essencial para sua conta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-phone" className="gap-1.5">
                <Phone size={13} />
                Telefone
              </Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+55 (11) 99999-9999"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-company" className="gap-1.5">
                <Building2 size={13} />
                Empresa
              </Label>
              <Input
                id="profile-company"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="Nome da empresa"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProfileOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveProfile} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Salvar perfil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
