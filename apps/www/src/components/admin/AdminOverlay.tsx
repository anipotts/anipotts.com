"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAdmin } from "@/context/AdminContext";
import AdminLoginModal from "./AdminLoginModal";
import AdminCommandCenter from "@/app/thoughts/admin/AdminCommandCenter";

export default function AdminOverlay() {
  const { isModalOpen, isAdmin, toggleModal } = useAdmin();

  return (
    <AnimatePresence>
      {isModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 md:p-8"
        >
          {/* Click outside to close */}
          <div className="absolute inset-0" onClick={toggleModal} />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-[#050505] border border-white/10 rounded-2xl shadow-2xl custom-scrollbar"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
          >
            {isAdmin ? (
              <div className="p-6 md:p-10 flex flex-col gap-6">
                <AdminCommandCenter />
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-[50vh]">
                <AdminLoginModal />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
