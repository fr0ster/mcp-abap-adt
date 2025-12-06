# RAP Business Objects

Complete workflows for creating RAP (Restful ABAP Programming) Business Objects with all related components.

## Documentation

- [Creating RAP BO](./creating-rap-bo.md) - Complete workflow for creating RAP Business Objects
- [Deferred Activation](./deferred-activation.md) - Group activation guide for related objects

## RAP BO Components

1. **Domains** → Base data types
2. **Data Elements** → Based on domains
3. **Tables** → Root entity table
4. **Draft Tables** → Draft-enabled tables
5. **CDS Views** → Interface view, consumption view, composite structures
6. **Behavior Definitions** → Behavior definition with draft enabled
7. **Behavior Implementations** → Implementation classes
8. **Metadata Extensions** → UI annotations
9. **Service Definitions** → Service binding

## Important Notes

- **Deferred Activation**: Create all objects without activation, then activate together
- **Dependencies**: Domains → Data Elements → Tables → CDS Views → Behavior → Service
- **Code Checking**: Always check code before update when using low-level handlers
- **Group Activation**: Use `ActivateObjectLow` for related objects

