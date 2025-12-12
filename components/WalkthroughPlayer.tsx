// 1. Save this as 'components/WalkthroughPlayer.tsx'
// You may need to install lucide-react: npm install lucide-react

import React, { useState, useEffect } from 'react';
import { Step } from '../types'; // Ensure this matches your types.ts location
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface WalkthroughPlayerProps {
  steps: Step[];
  onClose: () => void;
  imageSrc: string;
}

export const WalkthroughPlayer: React.FC<WalkthroughPlayerProps> = ({ steps, onClose, imageSrc }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, steps.length]);

  if (!steps || steps.length === 0) return null;

  const currentStep = steps[currentIndex];

  const handleNext = () => {
    if (currentIndex < steps.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const isTopHalf = currentStep.y < 50;
  const isLeftHalf = currentStep.x < 50;

  let tooltipWrapperStyle: React.CSSProperties = {};

  if (isMobile) {
    tooltipWrapperStyle = {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '16px',
      zIndex: 60,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      pointerEvents: 'none',
    };
  } else {
    tooltipWrapperStyle = {
      position: 'absolute',
      width: '18rem',
      maxWidth: '90vw',
      zIndex: 20,
      transition: 'all 500ms ease-in-out',
      ...(isTopHalf
        ? { top: `${currentStep.y + currentStep.height}%`, paddingTop: '12px' }
        : { bottom: `${100 - currentStep.y}%`, paddingBottom: '12px' }
      ),
      ...(isLeftHalf
        ? { left: `${currentStep.x}%` }
        : { right: `${100 - (currentStep.x + currentStep.width)}%` }
      )
    };
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-[fadeIn_0.2s_ease-out]">
      <div
        className="absolute inset-0 bg-black/95 backdrop-blur-sm"
        onClick={onClose}
      />

      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-tooltip {
          animation: slideUpFade 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <div className={`relative z-10 w-full h-full flex items-center justify-center pointer-events-none ${isMobile ? 'p-0 pb-32' : 'p-4 md:p-8'}`}>
        <div className="relative pointer-events-auto inline-block">
          <img
            src={imageSrc}
            alt="Walkthrough Target"
            className={`block w-auto h-auto object-contain rounded-lg select-none bg-black shadow-2xl
              ${isMobile ? 'max-w-full max-h-[65vh]' : 'max-w-[90vw] max-h-[85vh]'}
            `}
          />

          <div
            className="absolute rounded-md transition-all duration-500 ease-in-out pointer-events-none z-10"
            style={{
              left: `${currentStep.x}%`,
              top: `${currentStep.y}%`,
              width: `${currentStep.width}%`,
              height: `${currentStep.height}%`,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
              border: '2px solid rgba(255, 255, 255, 0.9)',
              filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.4))'
            }}
          />

          {!isMobile && (
            <div style={tooltipWrapperStyle} className="flex flex-col">
              <div
                key={currentStep.id}
                className={`animate-tooltip bg-white text-slate-900 rounded-lg shadow-2xl p-5 border border-slate-100 flex flex-col pointer-events-auto
                    ${!isLeftHalf ? 'items-end text-right' : 'items-start text-left'}
                  `}
              >
                <StepContent
                  step={currentStep}
                  index={currentIndex}
                  total={steps.length}
                  onClose={onClose}
                  onNext={handleNext}
                  onPrev={handlePrev}
                />
              </div>

              <div
                className={`w-0 h-0 border-[8px] border-transparent transition-all duration-500 pointer-events-none
                    ${isTopHalf
                    ? 'border-b-white -mt-[1px] order-first'
                    : 'border-t-white -mb-[1px] order-last'
                  }
                    ${isLeftHalf ? 'self-start ml-4' : 'self-end mr-4'}
                   `}
              />
            </div>
          )}
        </div>
      </div>

      {isMobile && (
        <div style={tooltipWrapperStyle}>
          <div
            key={currentStep.id}
            className="animate-tooltip bg-white text-slate-900 rounded-xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] p-5 border border-slate-100 w-full max-w-lg mx-auto pointer-events-auto"
          >
            <StepContent
              step={currentStep}
              index={currentIndex}
              total={steps.length}
              onClose={onClose}
              onNext={handleNext}
              onPrev={handlePrev}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const StepContent: React.FC<{
  step: Step;
  index: number;
  total: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}> = ({ step, index, total, onClose, onNext, onPrev }) => (
  <div className="w-full">
    <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
        Step {index + 1} / {total}
      </span>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition"
        title="Close Tour"
      >
        <X size={16} />
      </button>
    </div>

    <h3 className="text-lg font-bold mb-1 leading-tight text-slate-800">{step.title}</h3>
    <p className="text-slate-600 text-sm mb-5 leading-relaxed">
      {step.description}
    </p>

    <div className="flex justify-between items-center pt-1">
      <button
        onClick={onClose}
        className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition px-2 py-2"
      >
        Skip
      </button>

      <div className="flex items-center gap-3">
        <button
          onClick={onPrev}
          disabled={index === 0}
          className={`p-2 rounded-full transition border border-slate-200
                        ${index === 0
              ? 'text-slate-300 bg-slate-50 cursor-not-allowed'
              : 'text-slate-600 hover:bg-slate-100 hover:border-slate-300 bg-white'}`}
          aria-label="Previous Step"
        >
          <ChevronLeft size={20} />
        </button>

        <button
          onClick={onNext}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center transition shadow-md shadow-indigo-200 active:scale-95"
        >
          {index === total - 1 ? 'Finish' : 'Next'}
          {index < total - 1 && <ChevronRight size={18} className="ml-1" />}
        </button>
      </div>
    </div>
  </div>
);