
import React from 'react';
import Button from './Button';
import Icon from './Icon';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmLabel = 'Xác nhận', 
  cancelLabel = 'Hủy bỏ',
  variant = 'danger'
}) => {
  if (!isOpen) return null;

  const iconName = variant === 'danger' ? 'trash' : variant === 'warning' ? 'warning' : 'info';
  const iconColor = variant === 'danger' ? 'text-red-400' : variant === 'warning' ? 'text-amber-400' : 'text-blue-400';
  const buttonVariant = variant === 'danger' ? 'warning' : variant === 'warning' ? 'secondary' : 'primary';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-6 w-full max-w-md relative animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start mb-4">
            <div className={`flex-shrink-0 p-2 rounded-full bg-slate-700/50 ${iconColor}`}>
                <Icon name={iconName} className="w-6 h-6" />
            </div>
            <div className="ml-4 flex-grow">
                <h2 className="text-xl font-bold text-slate-100">{title}</h2>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">{message}</p>
            </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-md transition-colors"
          >
            {cancelLabel}
          </button>
          <Button
            onClick={() => { onConfirm(); onClose(); }}
            variant={buttonVariant}
            className="!w-auto !py-2 !px-5 !text-sm"
          >
            {confirmLabel}
          </Button>
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

export default ConfirmationModal;
