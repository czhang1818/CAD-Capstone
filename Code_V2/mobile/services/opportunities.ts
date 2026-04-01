import api from './api';
import { OpportunityState, OpportunitySummary, OpportunityRecommendationResult } from '../types/opportunity';

export const opportunityService = {
    getById: async (id: string): Promise<OpportunityState> => {
        const res = await api.get<OpportunityState>(`/api/opportunities/${id}`);
        return res.data;
    },

    search: async (query?: string, category?: string): Promise<OpportunitySummary[]> => {
        const params: Record<string, string> = {};
        if (query) params.query = query;
        if (category) params.category = category;
        params._t = Date.now().toString(); // CACHE BUSTER
        const config = { params };
        const res = await api.get<OpportunitySummary[]>('/api/opportunities', config);
        return res.data;
    },

    recommendForVolunteer: async (data: {
        volunteerId: string;
        query?: string;
        category?: string;
        lat?: number;
        lon?: number;
        skip?: number;
        take?: number;
    }): Promise<OpportunityRecommendationResult> => {
        const params = new URLSearchParams();
        params.append('volunteerId', data.volunteerId);
        if (data.query) params.append('query', data.query);
        if (data.category) params.append('category', data.category);
        if (typeof data.lat === 'number') params.append('lat', String(data.lat));
        if (typeof data.lon === 'number') params.append('lon', String(data.lon));
        if (typeof data.skip === 'number') params.append('skip', String(data.skip));
        if (typeof data.take === 'number') params.append('take', String(data.take));
        const res = await api.get<OpportunityRecommendationResult>(`/api/opportunities/recommend?${params.toString()}`);
        return res.data;
    },

    getByIds: async (ids: string[]): Promise<OpportunitySummary[]> => {
        const params = new URLSearchParams();
        ids.forEach(id => params.append('ids', id));
        const res = await api.get<OpportunitySummary[]>(`/api/opportunities/by-ids?${params.toString()}`);
        return res.data;
    },

    publish: async (id: string): Promise<void> => {
        await api.post(`/api/opportunities/${id}/publish`);
    },

    cancel: async (id: string, reason: string): Promise<void> => {
        await api.post(`/api/opportunities/${id}/cancel`, { reason });
    },

    addShift: async (id: string, data: { name: string; startTime: string; endTime: string; maxCapacity: number }): Promise<void> => {
        await api.post(`/api/opportunities/${id}/shifts`, data);
    },

    apply: async (id: string, data: { volunteerId: string; shiftId: string; idempotencyKey: string }): Promise<{ applicationId: string }> => {
        const res = await api.post(`/api/opportunities/${id}/apply`, data);
        return res.data;
    },

    withdrawApplication: async (oppId: string, appId: string): Promise<void> => {
        await api.delete(`/api/opportunities/${oppId}/apply/${appId}`);
    },

    validateGeo: async (id: string, lat: number, lon: number): Promise<boolean> => {
        const res = await api.post<{ isValid: boolean }>(`/api/opportunities/${id}/validate-geo`, { lat, lon });
        return res.data.isValid;
    },

    updateInfo: async (id: string, data: { title: string; description: string; category: string; lat?: number; lon?: number; radiusMeters?: number }): Promise<void> => {
        await api.put(`/api/opportunities/${id}/info`, data);
    },

    setGeoFence: async (id: string, data: { lat: number; lon: number; radiusMeters: number }): Promise<void> => {
        await api.post(`/api/opportunities/${id}/geofence`, data);
    },

    recover: async (id: string): Promise<void> => {
        await api.post(`/api/opportunities/${id}/recover`);
    },

    removeShift: async (id: string, shiftId: string): Promise<void> => {
        await api.delete(`/api/opportunities/${id}/shifts/${shiftId}`);
    },

    updateShift: async (id: string, shiftId: string, data: { name: string; startTime: string; endTime: string; maxCapacity: number }): Promise<void> => {
        await api.put(`/api/opportunities/${id}/shifts/${shiftId}`, data);
    },

    notifyVolunteers: async (id: string, data: { message: string; targetStatus: 'Approved' | 'All' }): Promise<{ sent: number }> => {
        const res = await api.post<{ sent: number }>(`/api/opportunities/${id}/notify`, data);
        return res.data;
    },

    clone: async (id: string): Promise<{ opportunityId: string }> => {
        const res = await api.post<{ opportunityId: string }>(`/api/opportunities/${id}/clone`);
        return res.data;
    },
};
