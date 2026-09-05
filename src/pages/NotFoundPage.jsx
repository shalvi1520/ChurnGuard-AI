import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <div className="w-16 h-16 rounded-2xl bg-bg-card border border-border flex items-center justify-center mx-auto mb-6">
          <Shield size={28} className="text-text-tertiary" />
        </div>
        <h1 className="text-6xl font-bold text-text-primary mb-2 tracking-tighter">404</h1>
        <h2 className="text-xl font-semibold text-text-primary mb-2">Page Not Found</h2>
        <p className="text-sm text-text-tertiary mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/dashboard">
          <Button variant="primary" size="lg" icon={ArrowLeft}>
            Back to Dashboard
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
