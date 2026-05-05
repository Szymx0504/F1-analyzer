import { NavLink } from "react-router-dom";

const links = [
    { to: "/", label: "Race Replay" },
    { to: "/season", label: "Season Overview" },
    { to: "/driver", label: "Driver Analysis" },
    { to: "/about", label: "About" },
];

export default function Navbar() {
    return (
        <nav className="navbar-f1 border-b border-f1-border px-6 py-4 flex items-center gap-10">
            <NavLink to="/" className="navbar-brand flex items-center gap-3">
                <img
                    src="/images/F1.png"
                    alt="Formula 1 logo"
                    className="h-9 w-auto object-contain"
                />
                <span className="text-f1-text text-sm font-semibold tracking-[0.18em] uppercase">
                    Analyzer
                </span>
            </NavLink>

            <div className="flex items-center gap-4">
                {links.map(({ to, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            `navbar-link ${isActive ? "active" : "inactive"}`
                        }
                    >
                        {label}
                    </NavLink>
                ))}
            </div>

            <div className="navbar-end ml-auto flex items-center gap-4 border-l border-f1-border pl-6">
                <img
                    src="/images/PP_logo.png"
                    alt="PP logo"
                    className="h-10 w-auto object-contain"
                />
            </div>
        </nav>
    );
}
