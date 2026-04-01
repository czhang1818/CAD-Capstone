import api from './api';

export interface EventTask {
    id: string;
    opportunityId: string;
    organizationId: string;
    title: string;
    note?: string;
    assignedToGrainId?: string;
    assignedToEmail?: string;
    assignedToName?: string;
    isCompleted: boolean;
    createdByGrainId: string;
    createdByEmail?: string;
    createdAt: string;
    completedAt?: string;
}

export const taskService = {
    getForOpportunity: async (oppId: string): Promise<EventTask[]> => {
        const res = await api.get<EventTask[]>(`/api/opportunities/${oppId}/tasks`);
        return res.data;
    },

    create: async (oppId: string, data: {
        title: string;
        note?: string;
        assignedToGrainId?: string;
        assignedToEmail?: string;
        assignedToName?: string;
        createdByGrainId: string;
        createdByEmail?: string;
    }): Promise<EventTask> => {
        const res = await api.post<EventTask>(`/api/opportunities/${oppId}/tasks`, data);
        return res.data;
    },

    toggleComplete: async (oppId: string, taskId: string): Promise<EventTask> => {
        const res = await api.patch<EventTask>(`/api/opportunities/${oppId}/tasks/${taskId}/complete`);
        return res.data;
    },

    delete: async (oppId: string, taskId: string): Promise<void> => {
        await api.delete(`/api/opportunities/${oppId}/tasks/${taskId}`);
    },
};
