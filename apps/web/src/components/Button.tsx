import React from "react";

interface ButtonProps {
  variant?: "primary" | "secondary" | "glass";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function Button({
  variant = "glass",
  size = "md",
  children,
  onClick,
  className
}: ButtonProps) {
  const baseClass = "glass-button";
  const variantClass = variant !== "glass" ? variant : "";
  const sizeClass = {
    sm: "btn-sm",
    md: "btn-md",
    lg: "btn-lg"
  }[size];

  return (
    <button
      className={`${baseClass} ${variantClass} ${sizeClass} ${className || ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
