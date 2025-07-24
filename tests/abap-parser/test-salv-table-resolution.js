#!/usr/bin/env node

/**
 * Демонстрація GetAbapSystemSymbols з реальним прикладом CL_SALV_TABLE
 * Показує як завантажується інформація з SAP системи
 */

const { handleGetAbapSystemSymbols } = require('../../dist/handlers/handleGetAbapSystemSymbols');

// ABAP код який використовує CL_SALV_TABLE
const salvTableExample = `
REPORT z_salv_demo.

DATA: gr_table TYPE REF TO cl_salv_table,
      gr_display TYPE REF TO cl_salv_display_settings,
      gt_data TYPE TABLE OF sflight.

CLASS lcl_salv_handler DEFINITION.
  PUBLIC SECTION.
    METHODS: display_alv
      IMPORTING ir_salv TYPE REF TO cl_salv_table.
      
    CLASS-METHODS: create_salv_table
      IMPORTING it_data TYPE ANY TABLE
      RETURNING VALUE(ro_salv) TYPE REF TO cl_salv_table.
ENDCLASS.

CLASS lcl_salv_handler IMPLEMENTATION.
  METHOD display_alv.
    DATA: lr_display TYPE REF TO cl_salv_display_settings.
    
    lr_display = ir_salv->get_display_settings( ).
    lr_display->set_striped_pattern( cl_salv_display_settings=>true ).
    lr_display->set_list_header( 'Flight Data Display' ).
    
    ir_salv->display( ).
  ENDMETHOD.
  
  METHOD create_salv_table.
    TRY.
        cl_salv_table=>factory(
          IMPORTING
            r_salv_table = ro_salv
          CHANGING
            t_table = it_data
        ).
      CATCH cx_salv_msg.
        MESSAGE 'Error creating SALV table' TYPE 'E'.
    ENDTRY.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  SELECT * FROM sflight INTO TABLE gt_data UP TO 100 ROWS.
  
  gr_table = lcl_salv_handler=>create_salv_table( gt_data ).
  
  DATA(lo_handler) = NEW lcl_salv_handler( ).
  lo_handler->display_alv( gr_table ).
`;

async function testSalvTableResolution() {
    console.log('🎯 GetAbapSystemSymbols - Тест з CL_SALV_TABLE');
    console.log('==============================================\n');
    
    console.log('📋 ABAP код з використанням CL_SALV_TABLE:');
    console.log('------------------------------------------');
    console.log(salvTableExample);
    console.log('\n');
    
    try {
        console.log('🔍 Аналіз коду з розв\'язуванням SAP системних класів...');
        console.log('--------------------------------------------------------');
        
        const result = await handleGetAbapSystemSymbols({
            code: salvTableExample,
            resolveSystemInfo: true,  // Увімкнути SAP інтеграцію
            includeLocalSymbols: true // Включити і локальні символи
        });
        
        if (result.isError) {
            console.error('❌ Помилка при аналізі:', result.content[0]?.text);
            return;
        }
        
        const data = JSON.parse(result.content[0].text);
        
        console.log('✅ Аналіз завершено успішно!');
        console.log(`📊 Загальна статистика:`);
        console.log(`   - Всього символів знайдено: ${data.symbols.length}`);
        console.log(`   - Розв'язано з SAP системи: ${data.systemResolutionStats.resolvedSymbols}`);
        console.log(`   - Не розв'язано: ${data.systemResolutionStats.failedSymbols}`);
        console.log(`   - Успішність розв'язування: ${data.systemResolutionStats.resolutionRate}`);
        console.log(`   - Залежності: ${data.dependencies.length}`);
        console.log('');
        
        // Знайти CL_SALV_TABLE та пов'язані класи
        const salvClasses = data.symbols.filter(s => 
            s.name.includes('CL_SALV') || s.name.includes('SALV')
        );
        
        if (salvClasses.length > 0) {
            console.log('🎯 Знайдені SALV класи та їх системна інформація:');
            console.log('================================================');
            
            salvClasses.forEach((symbol, index) => {
                console.log(`\n${index + 1}. ${symbol.name} (${symbol.type})`);
                console.log(`   📍 Знайдено в рядку: ${symbol.line}`);
                console.log(`   🔧 Скоуп: ${symbol.scope}`);
                console.log(`   👁️  Видимість: ${symbol.visibility || 'не визначено'}`);
                
                if (symbol.systemInfo) {
                    console.log(`   🌐 Системна інформація:`);
                    console.log(`      - Існує в SAP: ${symbol.systemInfo.exists ? '✅ ТАК' : '❌ НІ'}`);
                    
                    if (symbol.systemInfo.exists) {
                        console.log(`      - Тип об'єкта: ${symbol.systemInfo.objectType}`);
                        console.log(`      - Опис: ${symbol.systemInfo.description || 'не надано'}`);
                        console.log(`      - Пакет: ${symbol.systemInfo.package || 'не визначено'}`);
                        
                        if (symbol.systemInfo.methods && symbol.systemInfo.methods.length > 0) {
                            console.log(`      - Методи (${symbol.systemInfo.methods.length}): ${symbol.systemInfo.methods.slice(0, 5).join(', ')}${symbol.systemInfo.methods.length > 5 ? '...' : ''}`);
                        }
                        
                        if (symbol.systemInfo.interfaces && symbol.systemInfo.interfaces.length > 0) {
                            console.log(`      - Інтерфейси: ${symbol.systemInfo.interfaces.join(', ')}`);
                        }
                        
                        if (symbol.systemInfo.superClass) {
                            console.log(`      - Батьківський клас: ${symbol.systemInfo.superClass}`);
                        }
                    } else if (symbol.systemInfo.error) {
                        console.log(`      - Помилка: ${symbol.systemInfo.error}`);
                    }
                } else {
                    console.log(`   ⚠️  Системна інформація відсутня`);
                }
            });
        } else {
            console.log('⚠️  SALV класи не знайдені в аналізі (можливо, не розпізнані як окремі символи)');
        }
        
        // Показати всі знайдені класи
        const allClasses = data.symbols.filter(s => s.type === 'class');
        console.log(`\n📚 Всі знайдені класи (${allClasses.length}):`);
        console.log('=====================================');
        
        allClasses.forEach((cls, index) => {
            console.log(`${index + 1}. ${cls.name}`);
            if (cls.systemInfo?.exists) {
                console.log(`   ✅ Розв'язано: ${cls.systemInfo.description || 'SAP System Class'}`);
                console.log(`   📦 Пакет: ${cls.systemInfo.package}`);
            } else {
                console.log(`   📍 Локальний клас`);
            }
        });
        
        // Показати методи що використовують SALV
        const salvMethods = data.symbols.filter(s => 
            s.type === 'method' && (
                s.name.includes('SALV') || 
                (s.description && s.description.includes('salv'))
            )
        );
        
        if (salvMethods.length > 0) {
            console.log(`\n🔧 Методи пов'язані з SALV (${salvMethods.length}):`);
            console.log('========================================');
            salvMethods.forEach((method, index) => {
                console.log(`${index + 1}. ${method.name} (рядок ${method.line})`);
                if (method.parameters && method.parameters.length > 0) {
                    console.log(`   📥 Параметри: ${method.parameters.map(p => `${p.name}(${p.type})`).join(', ')}`);
                }
            });
        }
        
        console.log('\n');
        console.log('💡 Пояснення:');
        console.log('- Система намагається розв\'язати кожен знайдений клас через handleGetClass()');
        console.log('- CL_SALV_TABLE має бути розв\'язаний як системний клас SAP');
        console.log('- Локальні класи (LCL_*) залишаються як локальні');
        console.log('- Успішність залежить від підключення до SAP системи');
        
    } catch (error) {
        console.error('💥 Помилка виконання тесту:', error.message);
        console.error('Stack trace:', error.stack);
        
        console.log('\n🔧 Можливі причини помилки:');
        console.log('1. Проект не зібрано: запустіть "make build"');
        console.log('2. Відсутнє підключення до SAP системи');
        console.log('3. Не налаштовані автентифікаційні дані');
        process.exit(1);
    }
}

// Додатковий тест з простішим прикладом
async function testSimpleSalvReference() {
    console.log('\n🔬 Додатковий тест: Простий референс на CL_SALV_TABLE');
    console.log('==================================================');
    
    const simpleCode = `
DATA: gr_salv TYPE REF TO cl_salv_table.

CLASS lcl_test DEFINITION.
  PUBLIC SECTION.
    METHODS: test
      IMPORTING ir_table TYPE REF TO cl_salv_table.
ENDCLASS.

CLASS lcl_test IMPLEMENTATION.
  METHOD test.
    ir_table->display( ).
  ENDMETHOD.
ENDCLASS.
`;
    
    try {
        const result = await handleGetAbapSystemSymbols({
            code: simpleCode,
            resolveSystemInfo: true,
            includeLocalSymbols: false // Тільки системні класи
        });
        
        if (!result.isError) {
            const data = JSON.parse(result.content[0].text);
            const systemClasses = data.symbols.filter(s => 
                s.systemInfo?.exists && s.systemInfo.objectType !== 'LOCAL'
            );
            
            console.log(`✅ Знайдено системних класів: ${systemClasses.length}`);
            systemClasses.forEach(cls => {
                console.log(`   🎯 ${cls.name}: ${cls.systemInfo?.description || 'SAP System Class'}`);
            });
        }
    } catch (error) {
        console.log('⚠️  Простий тест також не вдався:', error.message);
        process.exit(1);
    }
}

// Запуск тестів
if (require.main === module) {
    testSalvTableResolution()
        .then(() => testSimpleSalvReference())
        .then(() => {
            console.log('\n✅ Всі тести завершено успішно!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Критична помилка:', error);
            process.exit(1);
        });
}

module.exports = { testSalvTableResolution, salvTableExample };
