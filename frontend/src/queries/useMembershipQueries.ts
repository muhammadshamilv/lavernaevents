import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changePlan,
  getMySubscription,
  getMyUsage,
  getPlanBySlug,
  getPlans,
  getPortalAccess,
  getTopupPacks,
  subscribeToPlan,
} from "@/api/membership.api";
import { useAuthStore } from "@/stores/auth.store";

export const membershipKeys = {
  plans: ["memberships", "plans"] as const,
  plan: (slug: string) => ["memberships", "plan", slug] as const,
  mySubscription: ["memberships", "my-subscription"] as const,
  myUsage: ["memberships", "my-usage"] as const,
  portalAccess: ["memberships", "portal-access"] as const,
  topupPacks: ["memberships", "topup-packs"] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: membershipKeys.plans,
    queryFn: getPlans,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePlan(slug: string | undefined) {
  return useQuery({
    queryKey: membershipKeys.plan(slug ?? ""),
    queryFn: () => getPlanBySlug(slug as string),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMySubscription() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: membershipKeys.mySubscription,
    queryFn: getMySubscription,
    enabled: !!user,
  });
}

export function useMyUsage() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: membershipKeys.myUsage,
    queryFn: getMyUsage,
    enabled: !!user,
  });
}

export function usePortalAccess() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: membershipKeys.portalAccess,
    queryFn: getPortalAccess,
    enabled: !!user,
    retry: false,
    // Never trust a cached "select_plan" answer: it was true before the
    // user paid and would bounce them back to /pricing.
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useSubscribeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planSlug: string) => subscribeToPlan(planSlug),
    onSuccess: (subscription) => {
      queryClient.setQueryData(membershipKeys.mySubscription, subscription);
      // removeQueries (not invalidate): an inactive query would keep serving
      // its old "select_plan" answer to PortalLayout until the refetch ends.
      queryClient.removeQueries({ queryKey: membershipKeys.portalAccess });
      queryClient.invalidateQueries({ queryKey: membershipKeys.myUsage });
    },
  });
}

export function useChangePlanMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planSlug: string) => changePlan(planSlug),
    onSuccess: (result) => {
      queryClient.setQueryData(membershipKeys.mySubscription, result.subscription);
      queryClient.removeQueries({ queryKey: membershipKeys.portalAccess });
      queryClient.invalidateQueries({ queryKey: membershipKeys.myUsage });
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 26: organizer-facing topup packs
// ---------------------------------------------------------------------------

export function useTopupPacks() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: membershipKeys.topupPacks,
    queryFn: getTopupPacks,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}