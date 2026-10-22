import Rules from './Rules';

// Responsive, text-based rules (replaces the old full-screen rules.png which was unreadable on phones).
export default function RulesScreen({ onClose }) {
  return <Rules onClose={onClose} />;
}
