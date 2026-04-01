import { AttendanceStatus } from './enums';

export interface TimeRecord {
    checkInTime: string;
    checkOutTime: string | null;
    totalHours: number;
}

export interface AttendanceRecordState {
    volunteerId: string;
    applicationId: string;
    opportunityId: string;
    verifiedTime: TimeRecord | null;
    status: AttendanceStatus;
    proofPhotoUrl: string;
    supervisorRating: number;
}

export interface AttendanceSummary {
    attendanceId: string;
    opportunityId: string;
    volunteerId: string;
    volunteerName: string;
    opportunityTitle: string;
    status: AttendanceStatus;
    shiftStartTime: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    totalHours: number;
}
