import api from './api';

export interface OrganizationSummary {
    orgId: string;
    name: string;
    description: string;
    status: string;
    createdAt: string;
    proofUrl?: string;
}

export interface UserRecord {
    id: string;
    email: string;
    role: string;
    isBanned: boolean;
    linkedGrainId: string;
    createdAt: string;
}

export interface SiloGrainDistribution {
    silo: string;
    totalActivations: number;
    grainTypes: { grainType: string; activations: number }[];
}

export interface GrainDistributionSummary {
    generatedAtUtc: string;
    totalSilos: number;
    totalActivations: number;
    silos: SiloGrainDistribution[];
}

export interface SiloRuntimeMetrics {
    cpuUsage: number;
    memoryUsageRatio: number | null;
    isOverloaded: boolean;
    activationCount: number;
    clientCount: number;
}

export interface SystemInfoSummary {
    generatedAtUtc: string;
    totalSilos: number;
    totalActivations: number;
    overallSystemRatio: number;
    overallBusinessRatio: number;
    silos: {
        silo: string;
        status: string;
        isAlive: boolean;
        hostName: string | null;
        totalActivations: number;
        runtime: SiloRuntimeMetrics | null;
    }[];
}

export const adminService = {
    approveOrg: async (orgId: string): Promise<void> => {
        await api.post(`/api/admin/organizations/${orgId}/approve`);
    },

    rejectOrg: async (orgId: string, reason: string): Promise<void> => {
        await api.post(`/api/admin/organizations/${orgId}/reject`, { reason });
    },

    banUser: async (userId: string): Promise<void> => {
        await api.post(`/api/admin/users/${userId}/ban`);
    },

    unbanUser: async (userId: string): Promise<void> => {
        await api.post(`/api/admin/users/${userId}/unban`);
    },

    resolveDispute: async (attendanceId: string, data: { resolution: string; adjustedHours: number }): Promise<void> => {
        await api.post(`/api/admin/disputes/${attendanceId}/resolve`, data);
    },

    getUsers: async (params?: { role?: string; search?: string }): Promise<UserRecord[]> => {
        const res = await api.get<UserRecord[]>('/api/admin/users', { params });
        return res.data;
    },

    getPendingOrganizations: async (): Promise<OrganizationSummary[]> => {
        const res = await api.get<OrganizationSummary[]>('/api/admin/pending-organizations');
        return res.data;
    },

    getAllOrganizations: async (): Promise<OrganizationSummary[]> => {
        const res = await api.get<OrganizationSummary[]>('/api/organizations');
        return res.data;
    },

    resetPassword: async (userId: string, newPassword: string): Promise<void> => {
        await api.post(`/api/admin/users/${userId}/reset-password`, { newPassword });
    },

    deleteUser: async (userId: string, confirmEmail: string): Promise<void> => {
        await api.delete(`/api/admin/users/${userId}`, { data: { confirmEmail } });
    },

    changeRole: async (userId: string, newRole: string): Promise<void> => {
        await api.post(`/api/admin/users/${userId}/change-role`, { newRole });
    },

    reassignCoordinator: async (orgId: string, coordinatorUserId: string): Promise<void> => {
        await api.post(`/api/admin/organizations/${orgId}/reassign-coordinator`, { coordinatorUserId });
    },

    addCoordinatorToOrg: async (orgId: string, coordinatorUserId: string): Promise<void> => {
        await api.post(`/api/admin/organizations/${orgId}/add-coordinator`, { coordinatorUserId });
    },

    removeCoordinatorFromOrg: async (orgId: string, coordinatorUserId: string): Promise<void> => {
        await api.post(`/api/admin/organizations/${orgId}/remove-coordinator`, { coordinatorUserId });
    },

    getGrainDistribution: async (): Promise<GrainDistributionSummary> => {
        const res = await api.get<GrainDistributionSummary>('/api/admin/runtime/grain-distribution');
        return res.data;
    },

    getSystemInfo: async (): Promise<SystemInfoSummary> => {
        const res = await api.get<SystemInfoSummary>('/api/admin/runtime/system-info');
        return res.data;
    },
};
