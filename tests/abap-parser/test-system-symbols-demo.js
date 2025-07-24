#!/usr/bin/env node

/**
 * Демонстрація детальної відповіді GetAbapSystemSymbols
 * Цей скрипт показує повну JSON структуру відповіді
 */

const { handleGetAbapSystemSymbols } = require('../../dist/handlers/handleGetAbapSystemSymbols');

// Простий ABAP код для демонстрації
const demoAbapCode = `
REPORT z_demo_program.

DATA: gv_counter TYPE i.
CONSTANTS: gc_version TYPE string VALUE '1.0'.

CLASS lcl_demo_class DEFINITION.
  PUBLIC SECTION.
    METHODS: process_data
      IMPORTING iv_input TYPE string
      RETURNING VALUE(rv_result) TYPE string.
ENDCLASS.

CLASS lcl_demo_class IMPLEMENTATION.
  METHOD process_data.
    DATA: lv_temp TYPE string.
    lv_temp = |Processed: { iv_input }|.
    rv_result = lv_temp.
  ENDMETHOD.
ENDCLASS.

FORM validate_input USING p_input TYPE string.
  DATA: lv_length TYPE i.
  lv_length = strlen( p_input ).
ENDFORM.

FUNCTION z_demo_function.
  DATA: lv_result TYPE string.
  lv_result = 'Demo function executed'.
ENDFUNCTION.

INTERFACE lif_demo_interface.
  METHODS: demo_method.
ENDINTERFACE.

INCLUDE z_demo_include.
`;

async function demonstrateSystemSymbols() {
    console.log('🔍 GetAbapSystemSymbols - Детальна демонстрація відповіді');
    console.log('========================================================\n');
    
    try {
        console.log('📋 Тестовий ABAP код:');
        console.log('---------------------');
        console.log(demoAbapCode);
        console.log('\n');
        
        // Тест 1: З вимкненою SAP інтеграцією (для демонстрації структури)
        console.log('🔧 Тест 1: Режим без SAP підключення');
        console.log('------------------------------------');
        
        const result1 = await handleGetAbapSystemSymbols({
            code: demoAbapCode,
            resolveSystemInfo: false,
            includeLocalSymbols: true
        });
        
        if (result1.isError) {
            console.error('❌ Помилка:', result1.content[0]?.text);
            return;
        }
        
        const data1 = JSON.parse(result1.content[0].text);
        console.log('✅ JSON відповідь (скорочена):');
        console.log(JSON.stringify({
            symbols: data1.symbols.slice(0, 3).map(s => ({
                name: s.name,
                type: s.type,
                scope: s.scope,
                line: s.line,
                visibility: s.visibility,
                systemInfo: s.systemInfo
            })),
            dependencies: data1.dependencies,
            systemResolutionStats: data1.systemResolutionStats,
            totalSymbolsFound: data1.symbols.length,
            totalScopesFound: data1.scopes.length
        }, null, 2));
        
        console.log('\n');
        
        // Тест 2: З увімкненою SAP інтеграцією (буде намагатися підключитися)
        console.log('🌐 Тест 2: Режим з SAP інтеграцією');
        console.log('----------------------------------');
        
        const result2 = await handleGetAbapSystemSymbols({
            code: demoAbapCode,
            resolveSystemInfo: true,
            includeLocalSymbols: false // Тільки системні символи
        });
        
        if (result2.isError) {
            console.error('❌ Помилка SAP підключення (очікувано без конфігурації):', result2.content[0]?.text);
        } else {
            const data2 = JSON.parse(result2.content[0].text);
            console.log('✅ JSON відповідь з SAP інтеграцією:');
            console.log(JSON.stringify({
                systemResolutionStats: data2.systemResolutionStats,
                sampleResolvedSymbol: data2.symbols.find(s => s.systemInfo) || 'Немає розв\'язаних символів',
                totalSymbols: data2.symbols.length
            }, null, 2));
        }
        
        console.log('\n');
        
        // Детальний розбір структури відповіді
        console.log('📊 Структура повної відповіді GetAbapSystemSymbols:');
        console.log('==================================================');
        
        const fullStructure = {
            "symbols": [
                {
                    "name": "STRING (назва символу)",
                    "type": "ENUM (class|method|function|variable|constant|type|interface|form|program|report|include)",
                    "scope": "STRING (global|назва батьківського скоупу)",
                    "line": "NUMBER (номер рядка в коді)",
                    "column": "NUMBER (позиція в рядку)",
                    "visibility": "ENUM (public|protected|private)",
                    "description": "STRING (опис символу, якщо є)",
                    "dataType": "STRING (тип даних ABAP, якщо є)",
                    "parameters": [
                        {
                            "name": "STRING (назва параметру)",
                            "type": "ENUM (importing|exporting|changing|returning)",
                            "dataType": "STRING (тип параметру)",
                            "optional": "BOOLEAN (чи опціональний)"
                        }
                    ],
                    "systemInfo": {
                        "exists": "BOOLEAN (чи існує в SAP системі)",
                        "objectType": "STRING (CLAS|FUNC|INTF|LOCAL)",
                        "description": "STRING (опис з SAP системи)",
                        "package": "STRING (назва пакету)",
                        "responsible": "STRING (відповідальний розробник)",
                        "lastChanged": "STRING (дата останніх змін)",
                        "methods": ["ARRAY (список методів для класів)"],
                        "interfaces": ["ARRAY (список інтерфейсів)"],
                        "superClass": "STRING (батьківський клас)",
                        "attributes": ["ARRAY (атрибути класу)"],
                        "error": "STRING (помилка розв'язування, якщо є)"
                    }
                }
            ],
            "dependencies": ["ARRAY (список includes та залежностей)"],
            "errors": [
                {
                    "message": "STRING (текст помилки)",
                    "line": "NUMBER (номер рядка)",
                    "column": "NUMBER (позиція)",
                    "severity": "ENUM (error|warning|info)"
                }
            ],
            "scopes": [
                {
                    "name": "STRING (назва скоупу)",
                    "type": "ENUM (global|class|method|form|function|local)",
                    "startLine": "NUMBER (початковий рядок)",
                    "endLine": "NUMBER (кінцевий рядок)",
                    "parent": "STRING (батьківський скоуп, якщо є)"
                }
            ],
            "systemResolutionStats": {
                "totalSymbols": "NUMBER (загальна кількість символів)",
                "resolvedSymbols": "NUMBER (кількість розв'язаних з SAP)",
                "failedSymbols": "NUMBER (кількість не розв'язаних)",
                "resolutionRate": "STRING (відсоток успішності, напр. '75.0%')"
            }
        };
        
        console.log(JSON.stringify(fullStructure, null, 2));
        
        console.log('\n');
        console.log('💡 Пояснення роботи:');
        console.log('1. Спочатку виконується семантичний аналіз коду');
        console.log('2. Для кожного символу намагається отримати інформацію з SAP:');
        console.log('   - handleGetClass() для класів');
        console.log('   - handleGetFunction() для функцій');
        console.log('   - handleGetInterface() для інтерфейсів');
        console.log('3. Додається системна інформація до кожного символу');
        console.log('4. Ведеться статистика успішності розв\'язування');
        
        console.log('\n');
        console.log('🎯 Налаштування:');
        console.log('- resolveSystemInfo: false = без SAP підключення');
        console.log('- resolveSystemInfo: true = з SAP підключенням');
        console.log('- includeLocalSymbols: true = включити локальні символи');
        console.log('- includeLocalSymbols: false = тільки системні символи');
        
    } catch (error) {
        console.error('💥 Помилка демонстрації:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
    
    // Завершити процес успішно
    process.exit(0);
}

// Запуск демонстрації
if (require.main === module) {
    demonstrateSystemSymbols().catch(error => {
        console.error('💥 Критична помилка:', error);
        process.exit(1);
    });
}

module.exports = { demonstrateSystemSymbols, demoAbapCode };
