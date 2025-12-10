
// utils/tagProcessors/QuestProcessor.ts
import { GameState, Quest, VectorUpdate, SubTask } from '../../types';
import { mergeAndDeduplicateByName } from '../arrayUtils';
import { sanitizeEntityName } from '../textProcessing';

// Hàm helper để tạo chuỗi thời gian đẹp từ WorldTime
const formatGameTime = (time: any): string => {
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(time.hour)}:${pad(time.minute)} (Ngày ${time.day}/${time.month})`;
};

/**
 * Xử lý logic thêm một nhiệm vụ mới hoặc cập nhật toàn bộ.
 * @param currentState - Trạng thái game hiện tại.
 * @param params - Các tham số từ thẻ [QUEST_NEW].
 * @returns Một đối tượng chứa trạng thái game mới và các yêu cầu cập nhật vector.
 */
export function processQuestUpdate(currentState: GameState, params: any): { newState: GameState, vectorUpdates: VectorUpdate[] } {
    if (!params.name) {
        console.warn('Bỏ qua thẻ [QUEST_NEW] không hợp lệ:', params);
        return { newState: currentState, vectorUpdates: [] };
    }

    const sanitizedName = sanitizeEntityName(params.name);
    const existingQuest = (currentState.quests || []).find(q => q.name.toLowerCase() === sanitizedName.toLowerCase());

    // Xử lý subTasks: Tách chuỗi thành mảng nếu cần
    let processedSubTasks: SubTask[] = [];
    if (params.subTasks) {
        if (typeof params.subTasks === 'string') {
            processedSubTasks = params.subTasks.split('|').map((desc: string, index: number) => ({
                id: `task_${Date.now()}_${index}`,
                desc: desc.trim(),
                isCompleted: false
            }));
        } else if (Array.isArray(params.subTasks)) {
             processedSubTasks = params.subTasks;
        }
    }

    // Logic tạo log đầu tiên nếu là nhiệm vụ mới
    let logs = existingQuest?.logs || [];
    if (!existingQuest) {
        const timeStr = formatGameTime(currentState.worldTime);
        logs = [`${timeStr} - Đã nhận nhiệm vụ.`];
    }

    const newQuestData: Quest = {
        name: sanitizedName,
        description: params.description || existingQuest?.description || '', 
        status: (params.status === 'hoàn thành' || params.status === 'thất bại') ? params.status : 'đang tiến hành',
        tags: params.tags ? (typeof params.tags === 'string' ? params.tags.split(',').map((t: string) => t.trim()) : params.tags) : (existingQuest?.tags || []),
        customCategory: params.category || existingQuest?.customCategory,
        // New fields
        type: params.type || existingQuest?.type || 'SIDE',
        currentObjective: params.objective || existingQuest?.currentObjective || params.description || 'Thực hiện nhiệm vụ',
        logs: logs,
        subTasks: processedSubTasks.length > 0 ? processedSubTasks : (existingQuest?.subTasks || []),
        parentQuestId: params.parentQuestId || existingQuest?.parentQuestId
    };

    const updatedQuests = mergeAndDeduplicateByName(currentState.quests || [], [newQuestData]);

    const vectorContent = `Nhiệm vụ: ${newQuestData.name}\nMô tả: ${newQuestData.description}\nTrạng thái: ${newQuestData.status}\nPhân loại: ${newQuestData.customCategory || 'Chưa rõ'}\nMục tiêu: ${newQuestData.currentObjective}`;
    const vectorUpdate: VectorUpdate = {
        id: newQuestData.name,
        type: 'Quest',
        content: vectorContent,
    };

    return {
        newState: {
            ...currentState,
            quests: updatedQuests,
        },
        vectorUpdates: [vectorUpdate],
    };
}

/**
 * Xử lý logic cập nhật nhật ký và tiến độ nhiệm vụ (Quest Log).
 * @param currentState
 * @param params - { name, entry, newObjective, subTaskComplete, status }
 */
export function processQuestLog(currentState: GameState, params: any): { newState: GameState, vectorUpdates: VectorUpdate[] } {
    if (!params.name) {
        return { newState: currentState, vectorUpdates: [] };
    }

    const sanitizedName = sanitizeEntityName(params.name);
    const quests = [...(currentState.quests || [])];
    const questIndex = quests.findIndex(q => q.name.toLowerCase() === sanitizedName.toLowerCase());

    if (questIndex === -1) {
        console.warn(`Không tìm thấy nhiệm vụ "${sanitizedName}" để cập nhật nhật ký.`);
        return { newState: currentState, vectorUpdates: [] };
    }

    const quest = { ...quests[questIndex] };
    const timeStr = formatGameTime(currentState.worldTime);
    let hasChange = false;

    // 1. Append Log
    if (params.entry) {
        const newLog = `${timeStr} - ${params.entry}`;
        quest.logs = [...(quest.logs || []), newLog];
        hasChange = true;
    }

    // 2. Update Objective
    if (params.newObjective) {
        quest.currentObjective = params.newObjective;
        hasChange = true;
    }

    // 3. Complete SubTask
    if (params.subTaskComplete && quest.subTasks) {
        const target = String(params.subTaskComplete).toLowerCase();
        const updatedSubTasks = quest.subTasks.map(task => {
            // Check by ID or Description text
            if (!task.isCompleted && (task.id === target || task.desc.toLowerCase().includes(target))) {
                hasChange = true;
                return { ...task, isCompleted: true };
            }
            return task;
        });
        quest.subTasks = updatedSubTasks;
        
        // Auto-log completion of subtask if not explicitly logged
        if (hasChange && !params.entry) {
             const completedTask = updatedSubTasks.find(t => t.isCompleted && (t.id === target || t.desc.toLowerCase().includes(target)));
             if (completedTask) {
                 quest.logs = [...(quest.logs || []), `${timeStr} - Hoàn thành mục tiêu: ${completedTask.desc}`];
             }
        }
    }

    // 4. Update Status (Manual override or Auto-complete logic could be added here)
    if (params.status) {
        quest.status = params.status;
        if (quest.status === 'hoàn thành') {
             quest.logs = [...(quest.logs || []), `${timeStr} - Nhiệm vụ đã hoàn thành.`];
             quest.currentObjective = "Đã hoàn thành";
        }
        hasChange = true;
    }

    if (!hasChange) return { newState: currentState, vectorUpdates: [] };

    quests[questIndex] = quest;

    const vectorContent = `Nhiệm vụ: ${quest.name}\nMô tả: ${quest.description}\nTrạng thái: ${quest.status}\nMục tiêu: ${quest.currentObjective}\nTiến độ: ${quest.logs?.slice(-1)[0] || ''}`;
    const vectorUpdate: VectorUpdate = {
        id: quest.name,
        type: 'Quest',
        content: vectorContent,
    };

    return {
        newState: {
            ...currentState,
            quests: quests
        },
        vectorUpdates: [vectorUpdate]
    };
}
