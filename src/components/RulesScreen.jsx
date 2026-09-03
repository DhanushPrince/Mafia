import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import rulesImg from '../../rules.png';

export default function RulesScreen({ onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0f111a] flex items-center justify-center overflow-hidden"
    >
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 p-3 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white z-10 bg-black/50 backdrop-blur-md"
      >
        <X size={32} />
      </button>

      <div className="w-full h-full p-4 md:p-8 flex items-center justify-center">
        <img 
          src={rulesImg} 
          alt="How to Play Mafia" 
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10"
        />
      </div>
    </motion.div>
  );
}
