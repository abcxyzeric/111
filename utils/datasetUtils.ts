// utils/datasetUtils.ts
import { FandomDataset } from '../types';

/**
 * Kiểm tra xem nội dung chuỗi có phải là Fandom Dataset JSON hợp lệ hay không.
 * Hàm này thực hiện kiểm tra cấu trúc cơ bản cho các trường metadata và mảng chunks.
 * @param content Nội dung chuỗi của tệp.
 * @returns True nếu là dataset hợp lệ, ngược lại là false.
 */
export const isFandomDataset = (content: string): boolean => {
  try {
    // Trim content to handle potential leading/trailing whitespace
    const trimmedContent = content.trim();
    // A valid JSON object must start with '{'
    if (!trimmedContent.startsWith('{')) {
        return false;
    }
    const data = JSON.parse(trimmedContent) as Partial<FandomDataset>;
    // Kiểm tra sự tồn tại và kiểu dữ liệu cơ bản của các thuộc tính chính
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof data.metadata === 'object' &&
      Array.isArray(data.chunks) &&
      // Tùy chọn, kiểm tra xem chunk đầu tiên có thuộc tính 'text' hay không
      (data.chunks.length === 0 || typeof data.chunks[0]?.text === 'string')
    );
  } catch (error) {
    // Nếu JSON.parse thất bại, nó không phải là JSON hợp lệ, do đó không phải là dataset của chúng ta.
    return false;
  }
};

/**
 * Trích xuất và nối tất cả văn bản từ các chunk của một Fandom Dataset.
 * @param content Nội dung chuỗi của tệp Fandom Dataset JSON.
 * @returns Một chuỗi duy nhất chứa tất cả văn bản đã được nối, hoặc nội dung gốc nếu nó không phải là dataset hợp lệ.
 */
export const extractCleanTextFromDataset = (content: string): string => {
  if (!isFandomDataset(content)) {
    // Nếu không phải là dataset, trả về nội dung gốc, giả định đó là văn bản thuần túy.
    return content;
  }

  try {
    const data = JSON.parse(content) as FandomDataset;
    // Nối văn bản từ mỗi chunk, cách nhau bằng hai dấu xuống dòng để tạo ngắt đoạn.
    return data.chunks.map(chunk => chunk.text).join('\n\n');
  } catch (error) {
    // Điều này lý tưởng sẽ không xảy ra do đã có kiểm tra isFandomDataset, nhưng để dự phòng:
    console.error("Lỗi khi phân tích dataset ngay cả sau khi đã xác thực:", error);
    return content; // Trả về nội dung gốc khi có lỗi
  }
};

/**
 * Sàng lọc cục bộ (Client-side) các chunk trong Dataset dựa trên danh sách từ khóa neo.
 * Chỉ giữ lại các chunk có chứa từ khóa, giới hạn số lượng chunk để đảm bảo prompt không quá dài.
 * @param datasetContent Nội dung JSON string của Dataset.
 * @param anchorKeywords Danh sách từ khóa để lọc (VD: Tên nhân vật, địa danh...).
 * @param maxChunks Giới hạn số lượng chunk tối đa được trả về (Mặc định 30).
 * @returns Văn bản đã được lọc và nối chuỗi.
 */
export const filterDatasetChunks = (datasetContent: string, anchorKeywords: string[], maxChunks: number = 30): string => {
    if (!isFandomDataset(datasetContent)) {
        return datasetContent; // Không phải dataset thì trả về nguyên gốc
    }

    try {
        const data = JSON.parse(datasetContent) as FandomDataset;
        const keywords = anchorKeywords.map(k => k.toLowerCase().trim()).filter(Boolean);
        
        if (keywords.length === 0) {
            // Nếu không có từ khóa, lấy maxChunks đoạn đầu tiên làm bối cảnh mặc định
            return data.chunks.slice(0, maxChunks).map(c => c.text).join('\n\n');
        }

        // Chấm điểm từng chunk dựa trên số lần xuất hiện của từ khóa
        const scoredChunks = data.chunks.map(chunk => {
            let score = 0;
            const lowerText = chunk.text.toLowerCase();
            keywords.forEach(keyword => {
                if (lowerText.includes(keyword)) {
                    score += 1;
                }
            });
            return { text: chunk.text, score };
        });

        // Lọc bỏ các chunk không có từ khóa nào (score = 0)
        // Tuy nhiên, nếu lọc xong mà quá ít (< 3 chunk), ta sẽ lấy fallback các chunk đầu tiên để đảm bảo có bối cảnh.
        let filteredChunks = scoredChunks.filter(c => c.score > 0);

        if (filteredChunks.length === 0) {
             return data.chunks.slice(0, 5).map(c => c.text).join('\n\n');
        }

        // Sắp xếp theo điểm giảm dần
        filteredChunks.sort((a, b) => b.score - a.score);

        // Cắt lấy Top K
        const topChunks = filteredChunks.slice(0, maxChunks);

        // Sắp xếp lại theo thứ tự xuất hiện gốc trong truyện (nếu cần logic thời gian, nhưng ở đây dataset không lưu index gốc rõ ràng ngoài thứ tự mảng)
        // Để đơn giản, ta nối lại.
        return topChunks.map(c => c.text).join('\n\n');

    } catch (error) {
        console.error("Lỗi khi lọc dataset:", error);
        return "";
    }
};