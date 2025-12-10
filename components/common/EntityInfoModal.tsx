
import React from 'react';
import Icon from './Icon';
import { InitialEntity } from '../../types';

interface EntityInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string | null;
  description: string | null;
  type: string | null;
  details?: InitialEntity['details'];
  // Bổ sung dữ liệu Quest mở rộng nếu có
  questData?: any; 
}

const EntityInfoModal: React.FC<EntityInfoModalProps> = ({ isOpen, onClose, title, description, type, details, questData }) => {
  if (!isOpen || !title) return null;

  const stripTags = (text: string | null): string => {
    if (!text) return "Không có mô tả chi tiết.";
    // Specifically remove game-related tags, leaving other potential HTML untouched.
    return text.replace(/<\/?(entity|important|exp|thought|status)>/g, '');
  };

  const RarityColor: { [key: string]: string } = {
      'Phổ thông': 'text-slate-300',
      'Không phổ biến': 'text-green-400',
      'Hiếm': 'text-blue-400',
      'Sử thi': 'text-purple-400',
      'Huyền thoại': 'text-orange-400',
  };

  const isQuest = type === 'Nhiệm Vụ' || type === 'Quest';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-6 w-full max-w-lg relative animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="w-full mr-4">
            <h2 className="text-xl font-bold text-yellow-400 truncate">{stripTags(title)}</h2>
            {type && !isQuest && <p className="text-sm text-slate-400">{type}{details?.subType && ` - ${details.subType}`}</p>}
            {details?.rarity && <p className={`text-sm font-semibold ${RarityColor[details.rarity] || 'text-slate-300'}`}>{details.rarity}</p>}
            
            {/* Quest Header */}
            {isQuest && questData && (
                <div className="flex items-center gap-2 mt-1">
                    {questData.type && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            questData.type === 'MAIN' ? 'bg-red-900/50 text-red-300 border border-red-700' :
                            questData.type === 'SIDE' ? 'bg-blue-900/50 text-blue-300 border border-blue-700' :
                            'bg-green-900/50 text-green-300 border border-green-700'
                        }`}>
                            {questData.type === 'MAIN' ? 'Cốt Truyện' : questData.type === 'SIDE' ? 'Phụ Tuyến' : 'Cá Nhân'}
                        </span>
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        questData.status === 'hoàn thành' ? 'bg-green-500/20 text-green-400' : 
                        questData.status === 'thất bại' ? 'bg-gray-500/20 text-gray-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                        {questData.status === 'hoàn thành' ? 'Đã Hoàn Thành' : questData.status === 'thất bại' ? 'Thất Bại' : 'Đang Tiến Hành'}
                    </span>
                </div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition flex-shrink-0">
             <Icon name="xCircle" className="w-7 h-7" />
          </button>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-4">
            
            {/* Quest Specific Content */}
            {isQuest && questData ? (
                <>
                    {/* 1. Mục tiêu hiện tại */}
                    {questData.currentObjective && questData.status !== 'hoàn thành' && (
                        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-md p-3">
                            <p className="text-xs text-yellow-500 font-bold uppercase mb-1">Mục Tiêu Hiện Tại</p>
                            <p className="text-slate-200 font-medium text-sm">{questData.currentObjective}</p>
                        </div>
                    )}

                    {/* 2. Checklist (Subtasks) */}
                    {questData.subTasks && questData.subTasks.length > 0 && (
                        <div>
                            <p className="text-sm font-bold text-slate-400 mb-2 border-b border-slate-700 pb-1">Danh sách công việc</p>
                            <ul className="space-y-2">
                                {questData.subTasks.map((task: any, idx: number) => (
                                    <li key={idx} className={`flex items-start gap-2 text-sm p-2 rounded ${task.isCompleted ? 'bg-green-900/10' : 'bg-slate-900/30'}`}>
                                        <div className={`mt-0.5 w-4 h-4 flex items-center justify-center rounded-sm border ${task.isCompleted ? 'bg-green-600 border-green-600' : 'border-slate-500'}`}>
                                            {task.isCompleted && <Icon name="checkCircle" className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className={task.isCompleted ? 'text-slate-500 line-through' : 'text-slate-200'}>
                                            {task.desc}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* 3. Mô tả chung */}
                    <div>
                        <p className="text-sm font-bold text-slate-400 mb-1">Mô tả</p>
                        <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                            {stripTags(description)}
                        </p>
                    </div>

                    {/* 4. Nhật ký hành trình (Logs) */}
                    {questData.logs && questData.logs.length > 0 && (
                        <div className="bg-slate-900/50 rounded-md p-3 border border-slate-700">
                            <p className="text-xs font-bold text-slate-400 mb-2 uppercase flex items-center gap-1">
                                <Icon name="news" className="w-3 h-3"/> Nhật Ký Hành Trình
                            </p>
                            <ul className="space-y-2 relative border-l border-slate-700 ml-1.5 pl-3">
                                {questData.logs.map((log: string, idx: number) => (
                                    <li key={idx} className="text-xs text-slate-400">
                                        <div className="absolute w-1.5 h-1.5 bg-slate-600 rounded-full -left-[4px] mt-1.5"></div>
                                        {log}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            ) : (
                // Default content for non-quest entities
                <>
                    <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {stripTags(description) || "Không có mô tả chi tiết."}
                    </p>

                    {details && (
                        <div className="mt-4 border-t border-slate-700 pt-4 text-sm space-y-2">
                            {details.stats && (
                                <div>
                                    <strong className="text-slate-400 block mb-1">Chỉ số:</strong>
                                    <div className="bg-slate-900/50 p-2 rounded-md">
                                        <p className="text-slate-300 whitespace-pre-wrap font-mono text-xs">{details.stats}</p>
                                    </div>
                                </div>
                            )}
                            {details.effects && (
                                <div>
                                    <strong className="text-slate-400 block mb-1">Hiệu ứng đặc biệt:</strong>
                                    <div className="bg-slate-900/50 p-2 rounded-md">
                                        <p className="text-slate-300 whitespace-pre-wrap text-xs">{details.effects}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>

        <style>{`
          @keyframes fade-in-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up {
            animation: fade-in-up 0.3s ease-out forwards;
          }
        `}</style>
      </div>
    </div>
  );
};

export default EntityInfoModal;
