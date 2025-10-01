CLASS zcl_demo_parser DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES: if_oo_adt_classrun.

    TYPES: BEGIN OF ty_result,
             value TYPE i,
             text  TYPE string,
           END OF ty_result,
           tt_results TYPE TABLE OF ty_result.

    CONSTANTS: gc_max_items TYPE i VALUE 100,
               gc_version   TYPE string VALUE '1.0'.

    CLASS-DATA: gv_instance_count TYPE i.

    METHODS: constructor
               IMPORTING iv_initial_value TYPE i DEFAULT 42,
             
             calculate
               IMPORTING iv_input TYPE i
               RETURNING VALUE(rv_result) TYPE i,
             
             get_results
               RETURNING VALUE(rt_results) TYPE tt_results.

  PROTECTED SECTION.
    DATA: mv_internal_value TYPE i,
          mt_results        TYPE tt_results.

  PRIVATE SECTION.
    CONSTANTS: lc_internal_factor TYPE i VALUE 2.
    DATA: mv_counter TYPE i.

ENDCLASS.

CLASS zcl_demo_parser IMPLEMENTATION.

  METHOD constructor.
    mv_internal_value = iv_initial_value.
    gv_instance_count = gv_instance_count + 1.
  ENDMETHOD.

  METHOD calculate.
    DATA: lv_temp TYPE i.
    lv_temp = iv_input * lc_internal_factor.
    
    IF lv_temp > gc_max_items.
      rv_result = gc_max_items.
    ELSE.
      rv_result = lv_temp.
    ENDIF.
    
    mv_counter = mv_counter + 1.
    
    DATA(ls_result) = VALUE ty_result( value = rv_result 
                                       text = |Result: { rv_result }| ).
    APPEND ls_result TO mt_results.
  ENDMETHOD.

  METHOD get_results.
    rt_results = mt_results.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    DATA: lo_demo TYPE REF TO zcl_demo_parser,
          lv_result TYPE i.

    TRY.
        lo_demo = NEW #( 10 ).
        lv_result = lo_demo->calculate( 25 ).
        
        out->write( |Calculated result: { lv_result }| ).
        out->write( |Instance count: { gv_instance_count }| ).
        
      CATCH cx_sy_arithmetic_overflow.
        out->write( 'Arithmetic overflow occurred' ).
    ENDTRY.
  ENDMETHOD.

ENDCLASS.
