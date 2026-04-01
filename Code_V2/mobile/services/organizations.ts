import api from './api';
import { OrgRole } from '../types/enums';
import { OpportunitySummary } from '../types/opportunity';
import { ApplicationSummary } from '../types/application';

export interface OrgState {
    name: string;
    description: string;
    status: string;
    members: { userId: string; email: string; role: OrgRole; joinedAt: string }[];
    opportunityIds: string[];
    blockedVolunteerIds: string[];
    isInitialized: boolean;
    createdAt: string;
    proofUrl?: string;
}

export interface OrganizationSummary {
    orgId: string;
    name: string;
    description: string;
    status: string;
    memberCount: number;
    opportunityCount: number;
    tags: string[];
    websiteUrl?: string;
    contactEmail?: string;
}

export interface EventTemplate {
    id: string;
    name: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    approvalPolicy: string;
    requiredSkillIds: string[];
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number | null;
}

export interface OrgVolunteerSummary {
    volunteerId: string;
    volunteerName: string;
    email: string;
    totalHours: number;
    completedOpportunities: number;
    applicationCount: number;
}

export const organizationService = {
    create: async (data: { name: string; description: string; creatorUserId: string; creatorEmail: string; proofUrl?: string }): Promise<{ orgId: string }> => {
        const res = await api.post('/api/organizations', data);
        return res.data;
    },

    getById: async (id: string): Promise<OrgState> => {
        const res = await api.get<OrgState>(`/api/organizations/${id}`);
        return res.data;
    },

    createOpportunity: async (orgId: string, data: { title: string; description: string; category: string }): Promise<{ opportunityId: string }> => {
        const res = await api.post(`/api/organizations/${orgId}/opportunities`, data);
        return res.data;
    },

    inviteMember: async (orgId: string, data: { email: string; role: OrgRole }): Promise<void> => {
        await api.post(`/api/organizations/${orgId}/members`, data);
    },

    blockVolunteer: async (orgId: string, volunteerId: string): Promise<void> => {
        await api.post(`/api/organizations/${orgId}/block/${volunteerId}`);
    },

    unblockVolunteer: async (orgId: string, volunteerId: string): Promise<void> => {
        await api.delete(`/api/organizations/${orgId}/block/${volunteerId}`);
    },

    getOpportunities: async (orgId: string): Promise<OpportunitySummary[]> => {
        const res = await api.get<OpportunitySummary[]>(`/api/organizations/${orgId}/opportunities`);
        return res.data;
    },

    getApplications: async (orgId: string): Promise<ApplicationSummary[]> => {
        const res = await api.get<ApplicationSummary[]>(`/api/organizations/${orgId}/applications`);
        return res.data;
    },

    updateInfo: async (orgId: string, data: { name: string; description: string }): Promise<void> => {
        await api.put(`/api/organizations/${orgId}`, data);
    },

    resubmit: async (orgId: string, data: { name: string; description: string; proofUrl?: string }): Promise<void> => {
        await api.post(`/api/organizations/${orgId}/resubmit`, data);
    },

    getEventTemplates: async (orgId: string): Promise<EventTemplate[]> => {
        const res = await api.get<EventTemplate[]>(`/api/organizations/${orgId}/event-templates`);
        return res.data;
    },

    saveEventTemplate: async (orgId: string, data: {
        name: string; title: string; description: string; category: string;
        tags: string[]; approvalPolicy: string; requiredSkillIds: string[];
        latitude: number | null; longitude: number | null; radiusMeters: number | null;
    }): Promise<{ id: string }> => {
        const res = await api.post<{ id: string }>(`/api/organizations/${orgId}/event-templates`, data);
        return res.data;
    },

    deleteEventTemplate: async (orgId: string, templateId: string): Promise<void> => {
        await api.delete(`/api/organizations/${orgId}/event-templates/${templateId}`);
    },

    getVolunteers: async (orgId: string): Promise<OrgVolunteerSummary[]> => {
        const res = await api.get<OrgVolunteerSummary[]>(`/api/organizations/${orgId}/volunteers`);
        return res.data;
    },

    updateProfile: async (orgId: string, data: { websiteUrl?: string; contactEmail?: string; tags: string[] }): Promise<void> => {
        await api.put(`/api/organizations/${orgId}/profile`, data);
    },

    postAnnouncement: async (orgId: string, text: string): Promise<void> => {
        await api.post(`/api/organizations/${orgId}/announcements`, { text });
    },

    getAnnouncements: async (orgId: string): Promise<{ id: string; text: string; createdAt: string }[]> => {
        const res = await api.get(`/api/organizations/${orgId}/announcements`);
        return res.data;
    },

    listApproved: async (): Promise<OrganizationSummary[]> => {
        const res = await api.get<OrganizationSummary[]>('/api/organizations/approved');
        return res.data;
    },

    getRecommended: async (volunteerId: string): Promise<OrganizationSummary[]> => {
        const res = await api.get<OrganizationSummary[]>(`/api/organizations/recommend?volunteerId=${volunteerId}`);
        return res.data;
    },
};

