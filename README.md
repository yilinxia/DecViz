<div align="center">
    <img src="./public/logo-white.png" alt="DecViz Logo" width="150">
    <h1 align="center">DecViz</h1>
</div>

# Overview
DecViz is a free, open-source web application that transforms domain knowledge into interactive graph visualizations through declarative programming.

# Getting Started

## Prerequisites
- Node.js (v16+)
- Python 3.11+
- Logica

## Installation

1. Clone and setup:
```bash
git clone https://github.com/yilinxia/DecViz.git
cd DecViz
conda env create -f environment.yml
conda activate decviz
npm install
```

2. Start development server:
```bash
npm run dev
```

## How It Works

DecViz uses a two-language approach:
1. **Domain Language**: Define facts and relationships using Logica
2. **Visual Language**: Configure visualization using Logica predicates

Example:
```logica
# Domain Language
Argument("a"); Argument("b");
Attacks("a", "b");

# Visual Language  
Node(node_id: x, label: x, shape: "circle") :- Argument(x);
Edge(source_id: source, target_id: target) :- Attacks(source, target);
```

# License 
The software is available under [Apache 2.0 License](https://github.com/yilinxia/DecViz/blob/main/LICENSE).

# Contact
For any queries, please [open an issue](https://github.com/yilinxia/DecViz/issues) on GitHub or contact [Yilin Xia](https://github.com/yilinxia).