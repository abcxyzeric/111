
// utils/tagProcessors/StatsProcessor.ts
import { GameState, CharacterStat, VectorUpdate } from '../../types';

/**
 * Tính toán một giá trị thay đổi ngẫu nhiên dựa trên mức độ và giá trị tối đa của chỉ số.
 * @param level - Mức độ thay đổi ('low', 'medium', 'high').
 * @param maxValue - Giá trị tối đa của chỉ số để tính toán %.
 * @returns Một số nguyên là giá trị thay đổi.
 */
function calculateFuzzyChange(level: 'low' | 'medium' | 'high', maxValue: number): number {
    let percentageMin = 0;
    let percentageMax = 0;

    switch (level) {
        case 'low':
            percentageMin = 0.05; // 5%
            percentageMax = 0.10; // 10%
            break;
        case 'medium':
            percentageMin = 0.15; // 15%
            percentageMax = 0.25; // 25%
            break;
        case 'high':
            percentageMin = 0.30; // 30%
            percentageMax = 0.50; // 50%
            break;
        default:
            return 0;
    }

    // Tạo một số ngẫu nhiên trong khoảng phần trăm đã định
    const randomPercentage = Math.random() * (percentageMax - percentageMin) + percentageMin;
    const change = Math.round(maxValue * randomPercentage);
    return Math.max(1, change); // Đảm bảo thay đổi ít nhất là 1
}

/**
 * Phân tích giá trị amount, hỗ trợ cả số tuyệt đối và chuỗi phần trăm (VD: "10%").
 * @param amountInput - Giá trị đầu vào từ thẻ.
 * @param baseValue - Giá trị cơ sở để tính phần trăm (thường là maxValue hiện tại).
 * @returns Giá trị tuyệt đối đã tính toán.
 */
function parseAmount(amountInput: string | number, baseValue: number): number {
    if (typeof amountInput === 'number') {
        return amountInput;
    }
    
    if (typeof amountInput === 'string') {
        const trimmed = amountInput.trim();
        if (trimmed.endsWith('%')) {
            const percent = parseFloat(trimmed.replace('%', ''));
            if (!isNaN(percent)) {
                return Math.round(baseValue * (percent / 100));
            }
        }
        const num = parseFloat(trimmed);
        return isNaN(num) ? 0 : num;
    }
    
    return 0;
}

/**
 * Xử lý logic thay đổi chỉ số của nhân vật, bao gồm cả thay đổi chính xác, thay đổi "mờ", và thay đổi giới hạn tối đa.
 * @param currentState - Trạng thái game hiện tại.
 * @param params - Các tham số từ thẻ [STAT_CHANGE].
 * @returns Một đối tượng chứa trạng thái game mới và mảng vectorUpdates rỗng.
 */
export function processStatChange(currentState: GameState, params: any): { newState: GameState, vectorUpdates: VectorUpdate[] } {
    if (!params.name || (!params.amount && !params.level)) {
        console.warn('Bỏ qua thẻ [STAT_CHANGE] không hợp lệ:', params);
        return { newState: currentState, vectorUpdates: [] };
    }

    const newStats = [...(currentState.character.stats || [])];
    const statIndex = newStats.findIndex(stat => stat.name.toLowerCase() === params.name.toLowerCase());

    if (statIndex === -1) {
        console.warn(`Cố gắng thay đổi chỉ số không tồn tại: "${params.name}"`);
        return { newState: currentState, vectorUpdates: [] };
    }

    const statToUpdate = { ...newStats[statIndex] };
    const operation = params.operation || 'add'; // Mặc định là add nếu thiếu
    
    let changeAmount = 0;

    // 1. Tính toán lượng thay đổi (changeAmount)
    if (params.level) {
        // Xử lý logic mờ (chỉ dùng cho thay đổi giá trị hiện tại)
        changeAmount = calculateFuzzyChange(params.level, statToUpdate.maxValue);
    } else {
        // Xử lý logic thay đổi chính xác hoặc phần trăm
        // Nếu thay đổi max, baseValue là maxValue hiện tại. Nếu hồi phục %, baseValue cũng là maxValue.
        changeAmount = parseAmount(params.amount, statToUpdate.maxValue);
    }

    // 2. Áp dụng thay đổi dựa trên Operation
    if (operation === 'add_max') {
        // Tăng giới hạn tối đa (Thăng cấp, đột phá)
        // Khi tăng Max, ta cũng tăng Value hiện tại một lượng tương ứng để giữ nguyên tỷ lệ (hoặc hồi phục nhẹ)
        statToUpdate.maxValue += changeAmount;
        // Tùy chọn: Cũng hồi phục lượng máu/mana tương ứng với lượng max vừa tăng
        statToUpdate.value += changeAmount; 
    } else if (operation === 'add') {
        // Tăng giá trị hiện tại (Hồi máu, hồi mana)
        statToUpdate.value += changeAmount;
    } else if (operation === 'subtract') {
        // Giảm giá trị hiện tại (Sát thương, tiêu hao)
        statToUpdate.value -= changeAmount;
    }

    // 3. Chuẩn hóa giá trị (Clamping)
    if (statToUpdate.hasLimit !== false) {
        // Nếu có giới hạn: 0 <= value <= maxValue
        statToUpdate.value = Math.max(0, Math.min(statToUpdate.value, statToUpdate.maxValue));
    } else {
        // Nếu không giới hạn (như Sức Mạnh, Trí Tuệ): Chỉ cần không âm, maxValue tự động tăng theo value
        statToUpdate.value = Math.max(0, statToUpdate.value);
        if (statToUpdate.value > statToUpdate.maxValue) {
            statToUpdate.maxValue = statToUpdate.value;
        }
    }

    newStats[statIndex] = statToUpdate;

    const newState = {
        ...currentState,
        character: {
            ...currentState.character,
            stats: newStats,
        },
    };
    return { newState, vectorUpdates: [] };
}
