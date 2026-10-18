import { keepPreviousData } from '@tanstack/react-query';
import type { QueryOf } from '@zenith/shared/core';
import { accessGovernanceContract } from '@zenith/shared/identity';
import { contractKey, useApiMutation, useApiQuery } from '@/lib/contract-query';

export type AccessRequestListQuery = NonNullable<QueryOf<typeof accessGovernanceContract.requestList>>;
export type AccessGrantListQuery = NonNullable<QueryOf<typeof accessGovernanceContract.grantList>>;
export type AccessReviewCampaignListQuery = NonNullable<QueryOf<typeof accessGovernanceContract.reviewCampaignList>>;
export type AccessReviewItemListQuery = NonNullable<QueryOf<typeof accessGovernanceContract.reviewItemList>>;
export type PermissionPolicyListQuery = NonNullable<QueryOf<typeof accessGovernanceContract.policyList>>;

export const identityAccessGovernanceKeys = {
  workflowOptions: contractKey(accessGovernanceContract.workflowOptions),
  all: ['identity-access-governance'] as const,
  requests: contractKey(accessGovernanceContract.requestList),
  grants: contractKey(accessGovernanceContract.grantList),
  reviewCampaigns: contractKey(accessGovernanceContract.reviewCampaignList),
  reviewItems: contractKey(accessGovernanceContract.reviewItemList),
  policies: contractKey(accessGovernanceContract.policyList),
};

export function useAccessWorkflowOptions(enabled = true) {
  return useApiQuery(accessGovernanceContract.workflowOptions, undefined, { enabled, staleTime: 5 * 60 * 1000 });
}

export function useAccessRequestList(query: AccessRequestListQuery, enabled = true) {
  return useApiQuery(accessGovernanceContract.requestList, { query }, { enabled, placeholderData: keepPreviousData });
}

export function useAccessGrantList(query: AccessGrantListQuery, enabled = true) {
  return useApiQuery(accessGovernanceContract.grantList, { query }, { enabled, placeholderData: keepPreviousData });
}

export function useAccessReviewCampaignList(query: AccessReviewCampaignListQuery, enabled = true) {
  return useApiQuery(accessGovernanceContract.reviewCampaignList, { query }, { enabled, placeholderData: keepPreviousData });
}

export function useAccessReviewItemList(query: AccessReviewItemListQuery, enabled = true) {
  return useApiQuery(accessGovernanceContract.reviewItemList, { query }, { enabled, placeholderData: keepPreviousData });
}

export function usePermissionPolicyList(query: PermissionPolicyListQuery, enabled = true) {
  return useApiQuery(accessGovernanceContract.policyList, { query }, { enabled, placeholderData: keepPreviousData });
}

export function useRevokeAccessGrant() {
  return useApiMutation(accessGovernanceContract.grantRevoke, {
    invalidate: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: identityAccessGovernanceKeys.all });
    },
  });
}

export function useDecideAccessReviewItem() {
  return useApiMutation(accessGovernanceContract.reviewItemDecide, {
    invalidate: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: identityAccessGovernanceKeys.all });
    },
  });
}

export function useCreateAccessReviewCampaign() {
  return useApiMutation(accessGovernanceContract.reviewCampaignCreate, {
    invalidate: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: identityAccessGovernanceKeys.reviewCampaigns });
      void queryClient.invalidateQueries({ queryKey: identityAccessGovernanceKeys.reviewItems });
    },
  });
}

export function useUpdatePermissionPolicy() {
  return useApiMutation(accessGovernanceContract.policyUpdate, {
    invalidate: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: identityAccessGovernanceKeys.policies });
    },
  });
}

export function useSavePermissionPolicy() {
  const mutation = useUpdatePermissionPolicy();
  return {
    isPending: mutation.isPending,
    mutateAsync: async ({ id: _id, values }: { id?: number; values: Parameters<typeof mutation.mutateAsync>[0]['body'] & { permissionCode: string } }) => {
      if (!values?.permissionCode) throw new Error('缺少权限码');
      return mutation.mutateAsync({ params: { permissionCode: values.permissionCode }, body: values });
    },
  };
}
