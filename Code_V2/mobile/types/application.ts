import { ApplicationStatus } from './enums';

export interface ApplicationState {
    volunteerId: string;
    opportunityId: string;
    shiftId: string;
    status: ApplicationStatus;
    idempotencyKey: string;
    expirationTime: string | null;
    questionAnswers: Record<string, string>;
    createdAt: string;
}

export interface ApplicationSummary {
    applicationId: string;
    opportunityId: string;
    shiftId: string;
    opportunityTitle: string;
    shiftName: string;
    shiftStartTime: string;
    shiftEndTime: string;
    volunteerId: string;
    volunteerName: string;
    status: ApplicationStatus;
    appliedAt: string;
    attendanceStatus?: string;
    organizationName: string;
    organizationId?: string;
}
