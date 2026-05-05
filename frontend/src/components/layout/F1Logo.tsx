interface LogoProps {
    className?: string;
}

export default function F1Logo({ className }: LogoProps) {
    return (
        <svg
            viewBox="0 0 84 32"
            role="img"
            aria-label="F1 logo"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M1 24.5C1 18.6 3.7 16.3 9.7 15.2 11.3 14.9 12.8 14.8 14.2 14.8 17.2 14.8 20 15.2 22.5 16.1 26.5 17.6 29.2 20.5 29.6 24.5H14.2C13.1 24.5 12.2 24.2 11.6 23.6 11.1 23.1 10.8 22.4 10.8 21.6 10.8 20.5 11.2 19.6 12 18.9 12.7 18.2 13.8 17.8 15.3 17.8 17.1 17.8 18.8 18.2 20.4 18.9 22.2 19.8 23.6 21 24.5 22.3 25.5 23.7 26 25.4 26 27.3 26 29.4 24.8 30.6 22.4 30.6H1Z"
                fill="#e10600"
            />
            <path d="M33 8.1H51.3L40 24.5H33V8.1Z" fill="#e10600" />
            <path d="M53.2 6.9H76.4L62.9 24.5H53.2V6.9Z" fill="#e10600" />
        </svg>
    );
}
