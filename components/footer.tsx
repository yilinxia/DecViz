import React from "react"

export default function Footer() {
    return (
        <footer className="border-t border-slate-200/60 bg-white/80 backdrop-blur-xl mt-auto">
            <div className="mx-auto w-[80%] px-4 sm:px-6 py-4">
                <div className="flex items-center justify-center">
                    <p className="text-xs sm:text-sm text-slate-600 text-center">
                        Released under the Apache 2.0 License. Copyright © 2025-present{" "}
                        <a
                            href="https://github.com/yilinxia/DecViz"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:no-underline transition-all duration-200"
                        >
                            DecViz Devs
                        </a>
                    </p>
                </div>
            </div>
        </footer>
    )
}
