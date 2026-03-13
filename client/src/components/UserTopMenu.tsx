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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refreshBridgeFromCurrentSession } from "@/lib/authBridge";
import { supabase } from "@/lib/supabaseClient";
import { trpc } from "@/lib/trpc";
import { Bookmark, Building2, ChevronDown, Crown, Loader2, LogOut, Phone, Settings, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function getInitials(name: string | null, email: string | null) {
  const base = (name ?? email ?? "").trim();
  if (!base) return "U";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export default function UserTopMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");

  const { data: billing } = trpc.billing.getProfile.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const { data: savedPosts } = trpc.post.list.useQuery(undefined, {
    enabled: isAuthenticated,
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

  return (
    <>
      <div className="fixed top-4 right-4 z-[80]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2.5 px-3 py-2 rounded-full border transition-all hover:scale-[1.02]"
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
                  {billing?.plan ?? "FREE"} · {(billing?.sparks ?? 0).toLocaleString("pt-BR")} ✦
                </span>
              </div>
              <ChevronDown size={14} className="opacity-80" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
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
            <DropdownMenuItem onClick={() => setLocation("/saved-posts")} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Bookmark size={14} />
                Posts salvos
              </span>
              <span className="text-xs font-semibold">{savedPosts?.length ?? 0}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/billing")}>
              <Settings size={14} />
              Configurações e plano
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
