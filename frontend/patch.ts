interface ScheduleBlockForm {
    id?: number | null;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    buildingId: number | null;
    classroomId: number | null;
}
