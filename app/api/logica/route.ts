import { NextRequest, NextResponse } from 'next/server'

// Helper function to parse Logica output with column names
function parseLogicaOutput(output: string): { columns: string[], rows: any[] } {
    const lines = output.split('\n')

    // Find the header line (contains column names)
    let headerLine = ''
    let dataStartIndex = -1

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('|') && line.includes('|') && !line.startsWith('+')) {
            // This is likely the header line
            headerLine = line
            // Find the next separator line to know where data starts
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim().startsWith('+')) {
                    dataStartIndex = j + 1
                    break
                }
            }
            break
        }
    }

    if (!headerLine || dataStartIndex === -1) return { columns: [], rows: [] }

    // Extract column names from header - remove leading/trailing pipes and split
    const columns = headerLine.replace(/^\||\|$/g, '').split('|').map(col => col.trim()).filter(col => col.length > 0)

    // Extract data lines (skip separator lines)
    const dataLines = lines.slice(dataStartIndex).filter(line => {
        const trimmed = line.trim()
        return trimmed && !trimmed.startsWith('+') && trimmed.includes('|')
    })

    if (dataLines.length === 0) return { columns, rows: [] }

    const rows = dataLines.map(line => {
        // Remove leading/trailing pipes and split by pipe
        const cleanLine = line.replace(/^\||\|$/g, '')
        return cleanLine.split('|').map(col => col.trim())
    }).filter(row => row.length > 0)

    return { columns, rows }
}

// Helper function to get value by column name
function getValueByColumn(row: any[], columns: string[], columnName: string): string {
    const index = columns.indexOf(columnName)
    return index >= 0 ? (row[index] || '') : ''
}

// Helper function to check if column exists
function hasColumn(columns: string[], columnName: string): boolean {
    return columns.includes(columnName)
}

// Logica rule representation
interface LogicaRule {
    head: {
        predicate: string
        args: any[]
    }
    body: {
        predicate: string
        args: any[]
    }[]
    isFact: boolean
}

// Logica program class (simplified version of the Python LogicaProgram)
class LogicaProgram {
    private rules: LogicaRule[]
    private facts: Map<string, any[]>

    constructor(rules: LogicaRule[]) {
        this.rules = rules
        this.facts = new Map()
        this.extractFacts()
    }

    private extractFacts() {
        for (const rule of this.rules) {
            if (rule.isFact) {
                const predicate = rule.head.predicate
                if (!this.facts.has(predicate)) {
                    this.facts.set(predicate, [])
                }
                this.facts.get(predicate)!.push(rule.head.args)
            }
        }
    }

    formattedPredicateSql(predicateName: string): string {
        // Generate SQL for a specific predicate
        const predicateRules = this.rules.filter(rule => rule.head.predicate === predicateName)

        if (predicateRules.length === 0) {
            throw new Error(`Predicate ${predicateName} not found`)
        }

        // Handle facts with named arguments (like Graph predicate)
        if (this.facts.has(predicateName)) {
            const facts = this.facts.get(predicateName)!
            if (facts.length === 0) {
                return `SELECT * FROM (SELECT 1 WHERE 0) AS ${predicateName}`
            }

            // Check if this is a named argument fact (like Graph)
            const firstFact = facts[0]
            if (firstFact.length > 0 && typeof firstFact[0] === 'object' && firstFact[0].name) {
                // This is a named argument fact
                const namedArgs = firstFact as any[]
                const columns = namedArgs.map(arg => `'${arg.value}' AS ${arg.name}`).join(', ')
                return `SELECT ${columns}`
            }

            // Generate UNION ALL query for all facts
            const columns = this.getColumnNames(predicateName)
            const unions = facts.map((fact: any[], index: number) => {
                const values = fact.map((arg: any, i: number) => {
                    const colName = columns[i] || `col${i}`
                    return `'${arg}' AS ${colName}`
                }).join(', ')
                return `SELECT ${values}`
            })

            return unions.join(' UNION ALL ')
        }

        // Handle rules (more complex logic would go here)
        return this.generateRuleSql(predicateRules[0])
    }

    private getColumnNames(predicateName: string): string[] {
        // Try to infer column names from the first rule
        const rule = this.rules.find(r => r.head.predicate === predicateName)
        if (rule) {
            return rule.head.args.map((arg, i) => {
                if (typeof arg === 'string' && arg.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                    return arg
                }
                return `col${i}`
            })
        }
        return []
    }

    private generateRuleSql(rule: LogicaRule): string {
        // Simplified rule-to-SQL generation
        // This would need to be much more sophisticated for complex rules
        const headPredicate = rule.head.predicate

        if (rule.body.length === 0) {
            // This is a fact
            const values = rule.head.args.map(arg => `'${arg}'`).join(', ')
            return `SELECT ${values}`
        }

        // For rules with body, generate a simple JOIN
        // This is a very simplified implementation
        const bodyPredicate = rule.body[0].predicate

        // Handle named arguments in the head
        if (rule.head.args.length > 0 && typeof rule.head.args[0] === 'object' && rule.head.args[0].name) {
            // This is a named argument rule (like Node or Edge)
            const namedArgs = rule.head.args as any[]
            const columns = namedArgs.map(arg => {
                // Map variable names to actual values from the body
                if (arg.value && typeof arg.value === 'string') {
                    // This is a variable reference, we need to map it to the body predicate
                    const bodyArgs = rule.body[0].args
                    const varIndex = bodyArgs.indexOf(arg.value)
                    if (varIndex >= 0) {
                        // Map to the corresponding column from the body predicate
                        return `t1.${arg.value} AS ${arg.name}`
                    }
                }
                return `'${arg.value}' AS ${arg.name}`
            }).join(', ')

            return `SELECT ${columns} FROM (${this.formattedPredicateSql(bodyPredicate)}) AS t1`
        }

        // Fallback for simple rules
        const columns = this.getColumnNames(headPredicate)
        return `SELECT ${columns.map(col => `t1.${col}`).join(', ')} FROM (${this.formattedPredicateSql(bodyPredicate)}) AS t1`
    }
}

// Parse Logica rules from content
function parseLogicaRules(logicaContent: string): LogicaRule[] {
    const rules: LogicaRule[] = []
    const lines = logicaContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))

    for (const line of lines) {
        try {
            const rule = parseLogicaRule(line)
            if (rule) {
                rules.push(rule)
            }
        } catch (error) {
            // console.log(`⚠️ Error parsing line: ${line}`, error)
        }
    }

    return rules
}

// Parse a single Logica rule
function parseLogicaRule(line: string): LogicaRule | null {
    // Handle facts (e.g., Argument("a"); or Graph(id: "af", rankdir: "TB"))
    const factMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s*;?\s*$/)
    if (factMatch) {
        const predicate = factMatch[1]
        const argsStr = factMatch[2]

        // Check if this has named arguments (e.g., id: "af", rankdir: "TB")
        if (argsStr.includes(':')) {
            const args = parseNamedArguments(argsStr)
            return {
                head: { predicate, args },
                body: [],
                isFact: true
            }
        } else {
            const args = parseArguments(argsStr)
            return {
                head: { predicate, args },
                body: [],
                isFact: true
            }
        }
    }

    // Handle rules (e.g., Node(node_id: x, label: x) :- Argument(x);)
    const ruleMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s*:-\s*([^;]+);?\s*$/)
    if (ruleMatch) {
        const predicate = ruleMatch[1]
        const headArgsStr = ruleMatch[2]
        const bodyStr = ruleMatch[3]

        const headArgs = parseNamedArguments(headArgsStr)
        const bodyPredicates = parseBodyPredicates(bodyStr)

        return {
            head: { predicate, args: headArgs },
            body: bodyPredicates,
            isFact: false
        }
    }

    return null
}

// Parse arguments from a string like '"a", "b", "c"'
function parseArguments(argsStr: string): any[] {
    const args: any[] = []
    let current = ''
    let inQuotes = false
    let quoteChar = ''

    for (let i = 0; i < argsStr.length; i++) {
        const char = argsStr[i]

        if (!inQuotes && (char === '"' || char === "'")) {
            inQuotes = true
            quoteChar = char
            current += char
        } else if (inQuotes && char === quoteChar) {
            inQuotes = false
            quoteChar = ''
            current += char
        } else if (!inQuotes && char === ',') {
            args.push(parseArgument(current.trim()))
            current = ''
        } else {
            current += char
        }
    }

    if (current.trim()) {
        args.push(parseArgument(current.trim()))
    }

    return args
}

// Parse named arguments like 'node_id: x, label: x'
function parseNamedArguments(argsStr: string): any[] {
    const args: any[] = []
    const pairs = argsStr.split(',').map(pair => pair.trim())

    for (const pair of pairs) {
        const colonMatch = pair.match(/^([^:]+):\s*(.+)$/)
        if (colonMatch) {
            const name = colonMatch[1].trim()
            let value = colonMatch[2].trim()

            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1)
            }

            args.push({ name, value })
        }
    }

    return args
}

// Parse body predicates
function parseBodyPredicates(bodyStr: string): { predicate: string, args: any[] }[] {
    const predicates: { predicate: string, args: any[] }[] = []
    const bodyMatch = bodyStr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)$/)

    if (bodyMatch) {
        const predicate = bodyMatch[1]
        const argsStr = bodyMatch[2]
        const args = parseArguments(argsStr)
        predicates.push({ predicate, args })
    }

    return predicates
}

// Parse a single argument value
function parseArgument(arg: string): any {
    arg = arg.trim()

    // Remove quotes
    if ((arg.startsWith('"') && arg.endsWith('"')) ||
        (arg.startsWith("'") && arg.endsWith("'"))) {
        return arg.slice(1, -1)
    }

    // Try to parse as number
    if (!isNaN(Number(arg))) {
        return Number(arg)
    }

    return arg
}

// Execute SQLite query (simplified in-memory implementation)
function executeSqliteQuery(sql: string): any[] {
    // console.log('🔍 Executing SQL:', sql)

    try {
        // Simple SQL executor for basic SELECT statements
        // This handles the most common cases from Logica compilation

        // Handle UNION ALL queries
        if (sql.includes('UNION ALL')) {
            const parts = sql.split('UNION ALL')
            const results: any[] = []

            for (const part of parts) {
                const trimmedPart = part.trim()
                if (trimmedPart.startsWith('SELECT')) {
                    try {
                        const partResults = executeSelectQuery(trimmedPart)
                        results.push(...partResults)
                    } catch (error) {
                        // console.log(`⚠️ Error parsing UNION part: ${trimmedPart}`, error)
                        // Continue with other parts
                    }
                }
            }

            return results
        }

        // Handle simple SELECT queries
        if (sql.startsWith('SELECT')) {
            return executeSelectQuery(sql)
        }

        // console.log('⚠️ Unsupported SQL query type:', sql)
        return []

    } catch (error) {
        console.error('❌ Error executing SQL:', error)
        return []
    }
}

// Execute a SELECT query
function executeSelectQuery(sql: string): any[] {
    // console.log('🔍 Parsing SELECT query:', sql)

    // Handle simple SELECT without FROM clause (e.g., SELECT 'value' AS col)
    const simpleSelectMatch = sql.match(/SELECT\s+(.+?)(?:\s+FROM\s+(.+?))?(?:\s+WHERE\s+(.+))?$/i)
    if (!simpleSelectMatch) {
        // console.log('⚠️ Could not parse SELECT query:', sql)
        return []
    }

    const selectClause = simpleSelectMatch[1]
    const fromClause = simpleSelectMatch[2]
    const whereClause = simpleSelectMatch[3]

    // Extract column names and values from SELECT clause
    const columns = selectClause.split(',').map(col => {
        col = col.trim()

        // Handle 'value' AS alias pattern
        const aliasMatch = col.match(/(?:'([^']+)'|"([^"]+)") AS (\w+)/i)
        if (aliasMatch) {
            return {
                value: aliasMatch[1] || aliasMatch[2],
                alias: aliasMatch[3]
            }
        }

        // Handle table.column AS alias pattern (e.g., t1.x AS node_id)
        const tableAliasMatch = col.match(/(\w+)\.(\w+)\s+AS\s+(\w+)/i)
        if (tableAliasMatch) {
            return {
                value: tableAliasMatch[2], // Use the column name
                alias: tableAliasMatch[3]   // Use the alias
            }
        }

        // Handle simple column references
        const simpleMatch = col.match(/^(\w+)$/)
        if (simpleMatch) {
            return {
                value: simpleMatch[1],
                alias: simpleMatch[1]
            }
        }

        // Handle quoted values without alias
        const quotedMatch = col.match(/^'([^']+)'$|^"([^"]+)"$/)
        if (quotedMatch) {
            return {
                value: quotedMatch[1] || quotedMatch[2],
                alias: `col${Math.random().toString(36).substr(2, 9)}`
            }
        }

        return { value: col, alias: col }
    })

    // Create result row
    const row: any = {}
    for (const col of columns) {
        row[col.alias] = col.value
    }

    // console.log('📊 Generated row:', row)
    return [row]
}

// Direct Logica evaluation without SQL (more reliable)
function evaluateLogicaDirectly(rules: LogicaRule[]): any {
    const results: any = {
        graph: { columns: [], rows: [] },
        nodes: { columns: [], rows: [] },
        edges: { columns: [], rows: [] },
        ranking: { columns: [], rows: [] }
    }

    // Extract facts
    const facts = new Map<string, any[]>()
    for (const rule of rules) {
        if (rule.isFact) {
            const predicate = rule.head.predicate
            if (!facts.has(predicate)) {
                facts.set(predicate, [])
            }
            facts.get(predicate)!.push(rule.head.args)
        }
    }

    // Process Graph predicate
    if (facts.has('Graph')) {
        const graphFacts = facts.get('Graph')!
        if (graphFacts.length > 0) {
            const firstFact = graphFacts[0]
            if (firstFact.length > 0 && typeof firstFact[0] === 'object' && firstFact[0].name) {
                // Named arguments
                const namedArgs = firstFact as any[]
                results.graph = {
                    columns: namedArgs.map(arg => arg.name),
                    rows: [namedArgs.map(arg => arg.value)]
                }
            }
        }
    }

    // Process Node predicate
    const nodeRules = rules.filter(rule => rule.head.predicate === 'Node' && !rule.isFact)
    if (nodeRules.length > 0) {
        const nodeRule = nodeRules[0]
        const bodyPredicate = nodeRule.body[0].predicate
        const bodyArgs = nodeRule.body[0].args

        if (facts.has(bodyPredicate)) {
            const bodyFacts = facts.get(bodyPredicate)!
            const nodeResults = bodyFacts.map(fact => {
                const result: any = {}
                for (const headArg of nodeRule.head.args) {
                    if (typeof headArg === 'object' && headArg.name) {
                        // Check if this is a variable reference by seeing if it matches any body argument
                        const varIndex = bodyArgs.indexOf(headArg.value)
                        if (varIndex >= 0) {
                            // Variable reference - substitute with actual value
                            result[headArg.name] = fact[varIndex]
                        } else {
                            // Literal value - use as is
                            result[headArg.name] = headArg.value
                        }
                    }
                }
                return result
            })

            if (nodeResults.length > 0) {
                results.nodes = {
                    columns: Object.keys(nodeResults[0]),
                    rows: nodeResults.map(row => Object.values(row))
                }
            }
        }
    }

    // Process Edge predicate
    const edgeRules = rules.filter(rule => rule.head.predicate === 'Edge' && !rule.isFact)
    if (edgeRules.length > 0) {
        const edgeRule = edgeRules[0]
        const bodyPredicate = edgeRule.body[0].predicate
        const bodyArgs = edgeRule.body[0].args

        if (facts.has(bodyPredicate)) {
            const bodyFacts = facts.get(bodyPredicate)!
            const edgeResults = bodyFacts.map(fact => {
                const result: any = {}
                for (const headArg of edgeRule.head.args) {
                    if (typeof headArg === 'object' && headArg.name) {
                        // Check if this is a variable reference by seeing if it matches any body argument
                        const varIndex = bodyArgs.indexOf(headArg.value)
                        if (varIndex >= 0) {
                            // Variable reference - substitute with actual value
                            result[headArg.name] = fact[varIndex]
                        } else {
                            // Literal value - use as is
                            result[headArg.name] = headArg.value
                        }
                    }
                }
                return result
            })

            if (edgeResults.length > 0) {
                results.edges = {
                    columns: Object.keys(edgeResults[0]),
                    rows: edgeResults.map(row => Object.values(row))
                }
            }
        }
    }

    // Process Ranking predicate
    const rankingRules = rules.filter(rule => rule.head.predicate === 'Ranking' && !rule.isFact)
    if (rankingRules.length > 0) {
        const rankingRule = rankingRules[0]
        const bodyPredicate = rankingRule.body[0].predicate
        const bodyArgs = rankingRule.body[0].args

        if (facts.has(bodyPredicate)) {
            const bodyFacts = facts.get(bodyPredicate)!
            const rankingResults = bodyFacts.map(fact => {
                const result: any = {}
                for (const headArg of rankingRule.head.args) {
                    if (typeof headArg === 'object' && headArg.name) {
                        // Check if this is a variable reference by seeing if it matches any body argument
                        const varIndex = bodyArgs.indexOf(headArg.value)
                        if (varIndex >= 0) {
                            // Variable reference - substitute with actual value
                            result[headArg.name] = fact[varIndex]
                        } else {
                            // Literal value - use as is
                            result[headArg.name] = headArg.value
                        }
                    }
                }
                return result
            })

            if (rankingResults.length > 0) {
                results.ranking = {
                    columns: Object.keys(rankingResults[0]),
                    rows: rankingResults.map(row => Object.values(row))
                }
            }
        }
    }

    return results
}

// JavaScript-based Logica parser (replaces Python execution)
// Based on Logica Playground implementation
function parseLogicaWithJavaScript(logicaContent: string): any {
    // console.log('🔍 Parsing Logica content with JavaScript...')

    try {
        // Parse Logica rules similar to the playground's RunPredicate function
        const rules = parseLogicaRules(logicaContent)
        // console.log('📋 Parsed rules:', rules)

        // Use direct evaluation instead of SQL compilation
        const results = evaluateLogicaDirectly(rules)
        // console.log('📊 Direct evaluation results:', results)
        return results

    } catch (error) {
        console.error('❌ Error parsing Logica:', error)
        // Fallback to simple parsing
        return parseLogicaSimple(logicaContent)
    }
}

// Simple fallback parser for basic cases
function parseLogicaSimple(logicaContent: string): any {
    // console.log('🔄 Using simple Logica parser as fallback...')

    const results: any = {
        graph: { columns: [], rows: [] },
        nodes: { columns: [], rows: [] },
        edges: { columns: [], rows: [] },
        ranking: { columns: [], rows: [] }
    }

    // Parse the Logica content line by line
    const lines = logicaContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))

    // Simple Logica parser for our specific use case
    for (const line of lines) {
        // Parse Graph definitions
        if (line.match(/^Graph\s*\(/)) {
            const graphAttrs = parseLogicaPredicate(line, 'Graph')
            if (graphAttrs) {
                results.graph = {
                    columns: Object.keys(graphAttrs),
                    rows: [Object.values(graphAttrs)]
                }
            }
        }

        // Parse Node definitions with rules
        if (line.match(/^Node\s*\(/)) {
            const nodeAttrs = parseLogicaPredicate(line, 'Node')
            if (nodeAttrs) {
                // This is a rule definition, we need to evaluate it
                const nodeResults = evaluateNodeRule(line, logicaContent)
                if (nodeResults.length > 0) {
                    results.nodes = {
                        columns: Object.keys(nodeResults[0]),
                        rows: nodeResults.map(row => Object.values(row))
                    }
                }
            }
        }

        // Parse Edge definitions with rules
        if (line.match(/^Edge\s*\(/)) {
            const edgeAttrs = parseLogicaPredicate(line, 'Edge')
            if (edgeAttrs) {
                // This is a rule definition, we need to evaluate it
                const edgeResults = evaluateEdgeRule(line, logicaContent)
                if (edgeResults.length > 0) {
                    results.edges = {
                        columns: Object.keys(edgeResults[0]),
                        rows: edgeResults.map(row => Object.values(row))
                    }
                }
            }
        }

        // Parse Ranking definitions with rules
        if (line.match(/^Ranking\s*\(/)) {
            const rankingAttrs = parseLogicaPredicate(line, 'Ranking')
            if (rankingAttrs) {
                // This is a rule definition, we need to evaluate it
                const rankingResults = evaluateRankingRule(line, logicaContent)
                if (rankingResults.length > 0) {
                    results.ranking = {
                        columns: Object.keys(rankingResults[0]),
                        rows: rankingResults.map(row => Object.values(row))
                    }
                }
            }
        }
    }

    // console.log('📊 Simple parsing results:', results)
    return results
}

// Parse Logica predicate syntax
function parseLogicaPredicate(line: string, predicateName: string): any {
    const match = line.match(new RegExp(`^${predicateName}\\s*\\(([^)]+)\\)`))
    if (!match) return null

    const content = match[1]
    const attrs: any = {}

    // Parse key-value pairs
    const pairs = content.split(',').map(pair => pair.trim())
    for (const pair of pairs) {
        const colonMatch = pair.match(/^([^:]+):\s*(.+)$/)
        if (colonMatch) {
            const key = colonMatch[1].trim()
            let value = colonMatch[2].trim()

            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1)
            }

            attrs[key] = value
        }
    }

    return attrs
}

// Evaluate Node rule (e.g., Node(node_id: x, label: x, ...) :- Argument(x))
function evaluateNodeRule(nodeRule: string, logicaContent: string): any[] {
    const results: any[] = []

    // Extract the rule condition (after :-)
    const ruleMatch = nodeRule.match(/:-([^;]+)/)
    if (!ruleMatch) return results

    const condition = ruleMatch[1].trim()

    // Parse the condition to find what predicate to look for
    const conditionMatch = condition.match(/^([^(]+)\s*\(([^)]+)\)/)
    if (!conditionMatch) return results

    const predicateName = conditionMatch[1].trim()
    const predicateArgs = conditionMatch[2].split(',').map(arg => arg.trim())

    // Find all instances of this predicate in the content
    const predicateInstances = findPredicateInstances(logicaContent, predicateName)

    // For each instance, create a node result
    for (const instance of predicateInstances) {
        const nodeAttrs = parseLogicaPredicate(nodeRule, 'Node')
        if (nodeAttrs) {
            const result: any = {}

            // Map variables to actual values
            for (const [key, value] of Object.entries(nodeAttrs)) {
                if (typeof value === 'string' && predicateArgs.includes(value)) {
                    // This is a variable, substitute with actual value
                    const argIndex = predicateArgs.indexOf(value)
                    result[key] = instance[argIndex]
                } else {
                    result[key] = value
                }
            }

            results.push(result)
        }
    }

    return results
}

// Evaluate Edge rule (e.g., Edge(source_id: source, target_id: target, ...) :- Attacks(source, target))
function evaluateEdgeRule(edgeRule: string, logicaContent: string): any[] {
    const results: any[] = []

    // Extract the rule condition (after :-)
    const ruleMatch = edgeRule.match(/:-([^;]+)/)
    if (!ruleMatch) return results

    const condition = ruleMatch[1].trim()

    // Parse the condition to find what predicate to look for
    const conditionMatch = condition.match(/^([^(]+)\s*\(([^)]+)\)/)
    if (!conditionMatch) return results

    const predicateName = conditionMatch[1].trim()
    const predicateArgs = conditionMatch[2].split(',').map(arg => arg.trim())

    // Find all instances of this predicate in the content
    const predicateInstances = findPredicateInstances(logicaContent, predicateName)

    // For each instance, create an edge result
    for (const instance of predicateInstances) {
        const edgeAttrs = parseLogicaPredicate(edgeRule, 'Edge')
        if (edgeAttrs) {
            const result: any = {}

            // Map variables to actual values
            for (const [key, value] of Object.entries(edgeAttrs)) {
                if (typeof value === 'string' && predicateArgs.includes(value)) {
                    // This is a variable, substitute with actual value
                    const argIndex = predicateArgs.indexOf(value)
                    result[key] = instance[argIndex]
                } else {
                    result[key] = value
                }
            }

            results.push(result)
        }
    }

    return results
}

// Evaluate Ranking rule (e.g., Ranking(len: l, samerank: x) :- Len(argu: x, len: l))
function evaluateRankingRule(rankingRule: string, logicaContent: string): any[] {
    const results: any[] = []

    // Extract the rule condition (after :-)
    const ruleMatch = rankingRule.match(/:-([^;]+)/)
    if (!ruleMatch) return results

    const condition = ruleMatch[1].trim()

    // Parse the condition to find what predicate to look for
    const conditionMatch = condition.match(/^([^(]+)\s*\(([^)]+)\)/)
    if (!conditionMatch) return results

    const predicateName = conditionMatch[1].trim()
    const predicateArgs = conditionMatch[2].split(',').map(arg => arg.trim())

    // Find all instances of this predicate in the content
    const predicateInstances = findPredicateInstances(logicaContent, predicateName)

    // For each instance, create a ranking result
    for (const instance of predicateInstances) {
        const rankingAttrs = parseLogicaPredicate(rankingRule, 'Ranking')
        if (rankingAttrs) {
            const result: any = {}

            // Map variables to actual values
            for (const [key, value] of Object.entries(rankingAttrs)) {
                if (typeof value === 'string' && predicateArgs.includes(value)) {
                    // This is a variable, substitute with actual value
                    const argIndex = predicateArgs.indexOf(value)
                    result[key] = instance[argIndex]
                } else {
                    result[key] = value
                }
            }

            results.push(result)
        }
    }

    return results
}

// Find all instances of a predicate in the Logica content
function findPredicateInstances(logicaContent: string, predicateName: string): string[][] {
    const instances: string[][] = []
    const lines = logicaContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))

    for (const line of lines) {
        const match = line.match(new RegExp(`^${predicateName}\\s*\\(([^)]+)\\)`))
        if (match) {
            const args = match[1].split(',').map(arg => {
                arg = arg.trim()
                // Remove quotes if present
                if ((arg.startsWith('"') && arg.endsWith('"')) ||
                    (arg.startsWith("'") && arg.endsWith("'"))) {
                    arg = arg.slice(1, -1)
                }
                return arg
            })
            instances.push(args)
        }
    }

    return instances
}

// Compiler function to convert Logica results to Graphviz DOT
function compileToGraphviz(results: any): string {
    let dot = 'digraph G {\n'

    // Add graph properties from Graph table - all optional, only include if user provides them
    if (results.graph && results.graph.rows && results.graph.rows.length > 0) {
        const graphRow = results.graph.rows[0]
        const columns = results.graph.columns

        // Only include properties that exist in the columns and have values
        if (hasColumn(columns, 'rankdir')) {
            const rankdir = getValueByColumn(graphRow, columns, 'rankdir')
            if (rankdir) dot += `  rankdir=${rankdir};\n`
        }
        // Emit layout attribute so downstream renderer can detect preferred engine
        if (hasColumn(columns, 'layout')) {
            const layout = getValueByColumn(graphRow, columns, 'layout')
            if (layout) dot += `  layout=${layout};\n`
        } else if (hasColumn(columns, 'engine')) {
            // Back-compat: allow Graph(engine: "neato") to map to DOT layout
            const engine = getValueByColumn(graphRow, columns, 'engine')
            if (engine) dot += `  layout=${engine};\n`
        }
        // Additional DOT graph attributes
        if (hasColumn(columns, 'bgcolor')) {
            const bgcolor = getValueByColumn(graphRow, columns, 'bgcolor')
            if (bgcolor) dot += `  bgcolor="${bgcolor}";\n`
        }
        if (hasColumn(columns, 'fontname')) {
            const fontname = getValueByColumn(graphRow, columns, 'fontname')
            if (fontname) dot += `  fontname="${fontname}";\n`
        }
        if (hasColumn(columns, 'fontsize')) {
            const fontsize = getValueByColumn(graphRow, columns, 'fontsize')
            if (fontsize) dot += `  fontsize=${fontsize};\n`
        }
        if (hasColumn(columns, 'fontcolor')) {
            const fontcolor = getValueByColumn(graphRow, columns, 'fontcolor')
            if (fontcolor) dot += `  fontcolor="${fontcolor}";\n`
        }
        if (hasColumn(columns, 'splines')) {
            const splines = getValueByColumn(graphRow, columns, 'splines')
            if (splines) dot += `  splines=${splines};\n`
        }
        if (hasColumn(columns, 'overlap')) {
            const overlap = getValueByColumn(graphRow, columns, 'overlap')
            if (overlap) dot += `  overlap=${overlap};\n`
        }
        if (hasColumn(columns, 'sep')) {
            const sep = getValueByColumn(graphRow, columns, 'sep')
            if (sep) dot += `  sep=${sep};\n`
        }
        if (hasColumn(columns, 'margin')) {
            const margin = getValueByColumn(graphRow, columns, 'margin')
            if (margin) dot += `  margin=${margin};\n`
        }
        if (hasColumn(columns, 'pad')) {
            const pad = getValueByColumn(graphRow, columns, 'pad')
            if (pad) dot += `  pad=${pad};\n`
        }
        if (hasColumn(columns, 'dpi')) {
            const dpi = getValueByColumn(graphRow, columns, 'dpi')
            if (dpi) dot += `  dpi=${dpi};\n`
        }
        if (hasColumn(columns, 'size')) {
            const size = getValueByColumn(graphRow, columns, 'size')
            if (size) dot += `  size="${size}";\n`
        }
        if (hasColumn(columns, 'ratio')) {
            const ratio = getValueByColumn(graphRow, columns, 'ratio')
            if (ratio) dot += `  ratio=${ratio};\n`
        }
        if (hasColumn(columns, 'concentrate')) {
            const concentrate = getValueByColumn(graphRow, columns, 'concentrate')
            if (concentrate) dot += `  concentrate=${concentrate};\n`
        }
        if (hasColumn(columns, 'compound')) {
            const compound = getValueByColumn(graphRow, columns, 'compound')
            if (compound) dot += `  compound=${compound};\n`
        }
        if (hasColumn(columns, 'nodesep')) {
            const nodesep = getValueByColumn(graphRow, columns, 'nodesep')
            if (nodesep) dot += `  nodesep=${nodesep};\n`
        }
        if (hasColumn(columns, 'ranksep')) {
            const ranksep = getValueByColumn(graphRow, columns, 'ranksep')
            if (ranksep) dot += `  ranksep=${ranksep};\n`
        }
        if (hasColumn(columns, 'esep')) {
            const esep = getValueByColumn(graphRow, columns, 'esep')
            if (esep) dot += `  esep=${esep};\n`
        }
        if (hasColumn(columns, 'ordering')) {
            const ordering = getValueByColumn(graphRow, columns, 'ordering')
            if (ordering) dot += `  ordering=${ordering};\n`
        }
        if (hasColumn(columns, 'outputorder')) {
            const outputorder = getValueByColumn(graphRow, columns, 'outputorder')
            if (outputorder) dot += `  outputorder=${outputorder};\n`
        }
        if (hasColumn(columns, 'pack')) {
            const pack = getValueByColumn(graphRow, columns, 'pack')
            if (pack) dot += `  pack=${pack};\n`
        }
        if (hasColumn(columns, 'packmode')) {
            const packmode = getValueByColumn(graphRow, columns, 'packmode')
            if (packmode) dot += `  packmode=${packmode};\n`
        }
        if (hasColumn(columns, 'remincross')) {
            const remincross = getValueByColumn(graphRow, columns, 'remincross')
            if (remincross) dot += `  remincross=${remincross};\n`
        }
        if (hasColumn(columns, 'searchsize')) {
            const searchsize = getValueByColumn(graphRow, columns, 'searchsize')
            if (searchsize) dot += `  searchsize=${searchsize};\n`
        }
        if (hasColumn(columns, 'style')) {
            const style = getValueByColumn(graphRow, columns, 'style')
            if (style) dot += `  style="${style}";\n`
        }
        if (hasColumn(columns, 'truecolor')) {
            const truecolor = getValueByColumn(graphRow, columns, 'truecolor')
            if (truecolor) dot += `  truecolor=${truecolor};\n`
        }
        if (hasColumn(columns, 'viewport')) {
            const viewport = getValueByColumn(graphRow, columns, 'viewport')
            if (viewport) dot += `  viewport="${viewport}";\n`
        }
        if (hasColumn(columns, 'xdotversion')) {
            const xdotversion = getValueByColumn(graphRow, columns, 'xdotversion')
            if (xdotversion) dot += `  xdotversion="${xdotversion}";\n`
        }
        // Handle explicit ranking (ranks attribute)
        if (hasColumn(columns, 'ranks')) {
            const ranks = getValueByColumn(graphRow, columns, 'ranks')
            if (ranks) {
                // Parse ranks string like "same A B C; same D E F"
                const rankGroups = ranks.split(';').map(group => group.trim()).filter(group => group)
                rankGroups.forEach(group => {
                    if (group.startsWith('same ')) {
                        const nodes = group.substring(5).trim().split(/\s+/).filter(node => node)
                        if (nodes.length > 0) {
                            dot += `  {rank = same ${nodes.join(' ')}}\n`
                        }
                    } else if (group.startsWith('min ')) {
                        const nodes = group.substring(4).trim().split(/\s+/).filter(node => node)
                        if (nodes.length > 0) {
                            dot += `  {rank = min ${nodes.join(' ')}}\n`
                        }
                    } else if (group.startsWith('max ')) {
                        const nodes = group.substring(4).trim().split(/\s+/).filter(node => node)
                        if (nodes.length > 0) {
                            dot += `  {rank = max ${nodes.join(' ')}}\n`
                        }
                    }
                })
            }
        }
        // Note: id attribute is not standard DOT syntax, skipping it
    }
    // No fallback defaults - all graph attributes are optional

    // Add nodes from Node table
    if (results.nodes && results.nodes.rows && results.nodes.rows.length > 0) {
        const columns = results.nodes.columns

        // Compute common attributes across all nodes for aggregation
        const aggregatableKeys = ['shape', 'style', 'fontsize']
        const commonValues: Record<string, string> = {}
        for (const key of aggregatableKeys) {
            if (!hasColumn(columns, key)) continue
            const firstValue = getValueByColumn(results.nodes.rows[0], columns, key)
            if (!firstValue) continue
            let allSame = true
            for (let i = 1; i < results.nodes.rows.length; i++) {
                const value = getValueByColumn(results.nodes.rows[i], columns, key)
                if (value !== firstValue) {
                    allSame = false
                    break
                }
            }
            if (allSame) commonValues[key] = firstValue
        }

        // Emit aggregated node defaults (exclude color/fillcolor by design)
        const aggregatedAttrs: string[] = []
        if (commonValues['shape']) aggregatedAttrs.push(`shape="${commonValues['shape']}"`)
        if (commonValues['style']) aggregatedAttrs.push(`style="${commonValues['style']}"`)
        if (commonValues['fontsize']) aggregatedAttrs.push(`fontsize=${commonValues['fontsize']}`)
        if (aggregatedAttrs.length > 0) {
            dot += '\n  node [\n'
            for (let i = 0; i < aggregatedAttrs.length; i++) {
                const isLast = i === aggregatedAttrs.length - 1
                dot += `    ${aggregatedAttrs[i]}\n`
            }
            dot += '  ];\n\n'
        }

        // Emit individual nodes, skipping attributes that are aggregated
        results.nodes.rows.forEach((nodeRow: any[]) => {
            const nodeId = getValueByColumn(nodeRow, columns, 'node_id') || 'unknown'

            const attrs = []

            if (hasColumn(columns, 'label')) {
                const label = getValueByColumn(nodeRow, columns, 'label')
                if (label) attrs.push(`label=\"${label}\"`)
            }
            if (hasColumn(columns, 'shape') && !commonValues['shape']) {
                const shape = getValueByColumn(nodeRow, columns, 'shape')
                if (shape) attrs.push(`shape=\"${shape}\"`)
            }
            // Support explicit style column separate from border
            if (hasColumn(columns, 'style') && !commonValues['style']) {
                const style = getValueByColumn(nodeRow, columns, 'style')
                if (style) attrs.push(`style=\"${style}\"`)
            }
            // Back-compat: map border -> style only if no explicit style provided
            if (!hasColumn(columns, 'style') && hasColumn(columns, 'border') && !commonValues['style']) {
                const border = getValueByColumn(nodeRow, columns, 'border')
                if (border) attrs.push(`style=\"${border}\"`)
            }
            if (hasColumn(columns, 'fontsize') && !commonValues['fontsize']) {
                const fontsize = getValueByColumn(nodeRow, columns, 'fontsize')
                if (fontsize) attrs.push(`fontsize=\"${fontsize}\"`)
            }
            // Color attributes should never be aggregated; keep them per-node
            if (hasColumn(columns, 'color')) {
                const color = getValueByColumn(nodeRow, columns, 'color')
                if (color) attrs.push(`color=\"${color}\"`)
            }
            if (hasColumn(columns, 'fillcolor')) {
                const fill = getValueByColumn(nodeRow, columns, 'fillcolor')
                if (fill) attrs.push(`fillcolor=\"${fill}\"`)
            }

            if (attrs.length > 0) {
                dot += `  \"${nodeId}\" [${attrs.join(', ')}];\n`
            } else {
                dot += `  \"${nodeId}\";\n`
            }
        })
        dot += '\n'
    }

    // Add ranking constraints from Ranking table
    if (results.ranking && results.ranking.rows && results.ranking.rows.length > 0) {
        const columns = results.ranking.columns

        dot += '\n'
        results.ranking.rows.forEach((rankingRow: any[]) => {
            const len = getValueByColumn(rankingRow, columns, 'len') || ''
            const samerank = getValueByColumn(rankingRow, columns, 'samerank') || ''

            if (samerank) {
                // Parse the samerank list (could be JSON array, ARRAY_AGG output, or comma-separated)
                try {
                    // Try JSON first
                    const nodes = JSON.parse(samerank)
                    if (Array.isArray(nodes) && nodes.length > 0) {
                        // Clean up quoted strings (remove extra quotes)
                        const cleanNodes = nodes.map(node => node.replace(/^"|"$/g, ''))
                        dot += `  { rank=same; ${cleanNodes.join('; ')}; }\n`
                    }
                } catch (e) {
                    // Try parsing as Python list string (e.g., "['T', 'A']")
                    try {
                        const pythonListMatch = samerank.match(/\[(.*?)\]/)
                        if (pythonListMatch) {
                            const listContent = pythonListMatch[1]
                            const nodes = listContent.split(',').map(n => n.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, '')).filter(n => n)
                            if (nodes.length > 0) {
                                dot += `  { rank=same; ${nodes.join('; ')}; }\n`
                            }
                        }
                    } catch (e2) {
                        // If not Python list, try parsing as comma-separated values
                        const nodes = samerank.split(',').map(n => n.trim()).filter(n => n)
                        if (nodes.length > 0) {
                            dot += `  { rank=same; ${nodes.join('; ')}; }\n`
                        }
                    }
                }
            }
        })
    }

    // Add edges from Edge table
    if (results.edges && results.edges.rows && results.edges.rows.length > 0) {
        const columns = results.edges.columns
        results.edges.rows.forEach((edgeRow: any[]) => {
            const sourceId = getValueByColumn(edgeRow, columns, 'source_id') || 'unknown'
            const targetId = getValueByColumn(edgeRow, columns, 'target_id') || 'unknown'

            // Build edge attributes dynamically based on available columns
            const attrs = []

            if (hasColumn(columns, 'color')) {
                const color = getValueByColumn(edgeRow, columns, 'color')
                if (color) attrs.push(`color="${color}"`)
            }
            if (hasColumn(columns, 'style')) {
                const style = getValueByColumn(edgeRow, columns, 'style')
                if (style) attrs.push(`style="${style}"`)
            }
            if (hasColumn(columns, 'dir')) {
                const dir = getValueByColumn(edgeRow, columns, 'dir')
                if (dir) attrs.push(`dir="${dir}"`)
            }
            if (hasColumn(columns, 'arrowhead')) {
                const arrowhead = getValueByColumn(edgeRow, columns, 'arrowhead')
                if (arrowhead) attrs.push(`arrowhead="${arrowhead}"`)
            }
            if (hasColumn(columns, 'arrowtail')) {
                const arrowtail = getValueByColumn(edgeRow, columns, 'arrowtail')
                if (arrowtail) attrs.push(`arrowtail="${arrowtail}"`)
            }
            if (hasColumn(columns, 'label')) {
                const label = getValueByColumn(edgeRow, columns, 'label')
                if (label) attrs.push(`label="${label}"`)
            }

            let edgeDef = `  "${sourceId}" -> "${targetId}"`
            if (attrs.length > 0) {
                edgeDef += ` [${attrs.join(', ')}]`
            }
            edgeDef += ';\n'
            dot += edgeDef
        })
    }

    dot += '}'
    return dot
}

export async function POST(request: NextRequest) {
    try {
        const { domainLanguage, visualLanguage } = await request.json()

        if (!domainLanguage || !domainLanguage.trim()) {
            return NextResponse.json(
                { error: 'Domain language is required' },
                { status: 400 }
            )
        }

        // Prepare Logica content for JavaScript parsing
        // Filter out engine specifications that might cause parsing errors
        const cleanVisualLanguage = (visualLanguage || '').replace(/@Engine\([^)]+\);/g, '').trim()
        const logicaContent = `${domainLanguage}

${cleanVisualLanguage}`

        // console.log('📝 Logica content:', logicaContent)

        // Execute Logica parsing using pure JavaScript (no Python dependency)
        // console.log('🔧 Parsing Logica using JavaScript implementation...')

        const results = parseLogicaWithJavaScript(logicaContent)

        // Compile results to Graphviz DOT
        const graphvizDot = compileToGraphviz(results)
        // console.log('🎨 Generated Graphviz DOT:', graphvizDot)

        // Always return the Logica results, even if empty
        return NextResponse.json({
            graphvizDot,
            logicaResults: results  // Always include the raw Logica results
        })

    } catch (error: any) {
        console.error('❌ Error in Logica API:', error)
        return NextResponse.json(
            { error: `Logica execution failed: ${error.message}` },
            { status: 500 }
        )
    }
}
