import SignalsBar from "./SignalsBar";
import LiveTime from "./LiveTime";

export default function Footer() {
  return (
    <footer className="w-full mt-24 pb-12">
      <SignalsBar />
      <div className="text-xs text-gray-600 font-mono flex justify-between">
        <div>© {new Date().getFullYear()} ani potts</div>
        <div className="flex gap-2">
          <LiveTime />
        </div>
      </div>
    </footer>
  );
}
