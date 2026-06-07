/**
 * Tests for the Phase 13 date, financial, and math/info function additions.
 * These cover every branch of the new def(...) registrations in functions.ts.
 */

import { describe, it, expect } from 'vitest';
import { evalFormula } from './test-helpers.js';

describe('date functions', () => {
  it('DATE builds a serial and propagates/validates args', () => {
    // Clean-room serial: no 1900 leap bug, so 2021-01-01 = 44196.
    expect(evalFormula('DATE(2021,1,1)')).toBe(44196);
    expect(evalFormula('DATE(1900,1,1)')).toBe(1);
    expect(evalFormula('DATE(1899,12,31)')).toBe(0);
    // Month overflow normalizes into the year.
    expect(evalFormula('DATE(2021,13,1)')).toBe(evalFormula('DATE(2022,1,1)'));
    // Negative serial (before epoch) -> #NUM!.
    expect(evalFormula('DATE(1800,1,1)')).toMatchObject({ type: '#NUM!' });
    // Arity.
    expect(evalFormula('DATE(2021,1)')).toMatchObject({ type: '#VALUE!' });
    // Error propagation per arg position.
    expect(evalFormula('DATE("x",1,1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATE(2021,"x",1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATE(2021,1,"x")')).toMatchObject({ type: '#VALUE!' });
  });

  it('YEAR/MONTH/DAY decompose a serial', () => {
    const s = evalFormula('DATE(2021,2,15)') as number;
    expect(s).toBe(44241);
    expect(evalFormula(`YEAR(${s})`)).toBe(2021);
    expect(evalFormula(`MONTH(${s})`)).toBe(2);
    expect(evalFormula(`DAY(${s})`)).toBe(15);
    // Arity, propagation, and negative-serial guards.
    expect(evalFormula('YEAR()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('MONTH("x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DAY(-1)')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('YEAR(-5)')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('MONTH(-5)')).toMatchObject({ type: '#NUM!' });
  });

  it('EDATE shifts by whole months', () => {
    const base = evalFormula('DATE(2021,1,31)') as number;
    expect(evalFormula(`EDATE(${base},1)`)).toBe(evalFormula('DATE(2021,2,28)'));
    expect(evalFormula(`EDATE(${base},-1)`)).toBe(evalFormula('DATE(2020,12,31)'));
    expect(evalFormula(`MONTH(EDATE(${base},13))`)).toBe(2);
    // Arity & propagation & guards.
    expect(evalFormula('EDATE(1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('EDATE("x",1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('EDATE(100,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('EDATE(-1,1)')).toMatchObject({ type: '#NUM!' });
    // Shift before epoch -> #NUM!.
    expect(evalFormula('EDATE(10,-12)')).toMatchObject({ type: '#NUM!' });
  });

  it('EOMONTH returns last day of the shifted month', () => {
    const base = evalFormula('DATE(2021,1,15)') as number;
    expect(evalFormula(`EOMONTH(${base},0)`)).toBe(evalFormula('DATE(2021,1,31)'));
    expect(evalFormula(`EOMONTH(${base},1)`)).toBe(evalFormula('DATE(2021,2,28)'));
    expect(evalFormula(`EOMONTH(${base},-1)`)).toBe(evalFormula('DATE(2020,12,31)'));
    // Arity, propagation, guards.
    expect(evalFormula('EOMONTH(1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('EOMONTH("x",1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('EOMONTH(100,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('EOMONTH(-1,1)')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('EOMONTH(5,-12)')).toMatchObject({ type: '#NUM!' });
  });

  it('WEEKDAY supports all three types', () => {
    // 2021-01-01 is a Friday (getUTCDay()=5).
    const fri = evalFormula('DATE(2021,1,1)') as number;
    expect(evalFormula(`WEEKDAY(${fri})`)).toBe(6); // type 1: Sun=1..Sat=7
    expect(evalFormula(`WEEKDAY(${fri},1)`)).toBe(6);
    expect(evalFormula(`WEEKDAY(${fri},2)`)).toBe(5); // type 2: Mon=1..Sun=7
    expect(evalFormula(`WEEKDAY(${fri},3)`)).toBe(4); // type 3: Mon=0..Sun=6
    // A Sunday: 2021-01-03.
    const sun = evalFormula('DATE(2021,1,3)') as number;
    expect(evalFormula(`WEEKDAY(${sun},1)`)).toBe(1);
    expect(evalFormula(`WEEKDAY(${sun},2)`)).toBe(7);
    expect(evalFormula(`WEEKDAY(${sun},3)`)).toBe(6);
    // Arity, propagation, guards, unknown type.
    expect(evalFormula('WEEKDAY()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('WEEKDAY("x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula(`WEEKDAY(${fri},"x")`)).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('WEEKDAY(-1)')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula(`WEEKDAY(${fri},9)`)).toMatchObject({ type: '#NUM!' });
  });

  it('DATEDIF computes D/M/Y differences', () => {
    const start = evalFormula('DATE(2020,1,15)') as number;
    const end = evalFormula('DATE(2021,3,10)') as number;
    expect(evalFormula(`DATEDIF(${start},${end},"D")`)).toBe(end - start);
    expect(evalFormula(`DATEDIF(${start},${end},"Y")`)).toBe(1);
    expect(evalFormula(`DATEDIF(${start},${end},"M")`)).toBe(13);
    // Lower-case unit accepted.
    expect(evalFormula(`DATEDIF(${start},${end},"d")`)).toBe(end - start);
    // Y branch where end has not reached the anniversary by month.
    const e2 = evalFormula('DATE(2020,12,1)') as number;
    expect(evalFormula(`DATEDIF(${start},${e2},"Y")`)).toBe(0);
    // Y branch where same month but earlier day.
    const e3 = evalFormula('DATE(2021,1,10)') as number;
    expect(evalFormula(`DATEDIF(${start},${e3},"Y")`)).toBe(0);
    // M branch where end day < start day decrements.
    const e4 = evalFormula('DATE(2020,3,10)') as number;
    expect(evalFormula(`DATEDIF(${start},${e4},"M")`)).toBe(1);
    // Arity, propagation, guards, bad unit.
    expect(evalFormula('DATEDIF(1,2)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATEDIF("x",2,"D")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATEDIF(1,"x","D")')).toMatchObject({ type: '#VALUE!' });
    // Unit arg itself is an error -> propagates.
    expect(evalFormula('DATEDIF(1,2,1/0)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula(`DATEDIF(${start},${end},"Q")`)).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('DATEDIF(-1,5,"D")')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('DATEDIF(5,2,"D")')).toMatchObject({ type: '#NUM!' });
  });

  it('DATEVALUE parses ISO dates', () => {
    expect(evalFormula('DATEVALUE("2021-01-01")')).toBe(44196);
    expect(evalFormula('DATEVALUE(" 2021-2-15 ")')).toBe(44241);
    // Bad format / out-of-range / rollover / non-text propagation.
    expect(evalFormula('DATEVALUE("not a date")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATEVALUE("2021-13-01")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATEVALUE("2021-02-30")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATEVALUE("1800-01-01")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATEVALUE("2021-01-00")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATEVALUE()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('DATEVALUE(1/0)')).toMatchObject({ type: '#DIV/0!' });
  });
});

describe('financial functions', () => {
  it('PMT computes loan payments', () => {
    expect(evalFormula('PMT(0.05/12,360,200000)')).toBeCloseTo(-1073.6432, 3);
    // rate = 0 branch.
    expect(evalFormula('PMT(0,10,1000)')).toBe(-100);
    // fv & type optional args.
    expect(evalFormula('PMT(0,10,1000,500)')).toBe(-150);
    expect(typeof evalFormula('PMT(0.01,12,1000,0,1)')).toBe('number');
    // Arity, propagation, nper=0 guard.
    expect(evalFormula('PMT(0.1,12)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PMT("x",12,1000)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PMT(0.1,"x",1000)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PMT(0.1,12,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PMT(0.1,12,1000,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PMT(0.1,12,1000,0,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PMT(0.1,0,1000)')).toMatchObject({ type: '#NUM!' });
  });

  it('FV computes future value', () => {
    expect(evalFormula('FV(0.06/12,120,-200)')).toBeCloseTo(32775.8694, 3);
    // rate = 0 branch.
    expect(evalFormula('FV(0,10,-100)')).toBe(1000);
    // pv & type optional.
    expect(evalFormula('FV(0,10,-100,-50)')).toBe(1050);
    expect(typeof evalFormula('FV(0.01,12,-100,0,1)')).toBe('number');
    // Arity & propagation.
    expect(evalFormula('FV(0.1,12)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('FV("x",12,-100)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('FV(0.1,"x",-100)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('FV(0.1,12,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('FV(0.1,12,-100,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('FV(0.1,12,-100,0,"x")')).toMatchObject({ type: '#VALUE!' });
  });

  it('PV computes present value', () => {
    expect(typeof evalFormula('PV(0.05/12,360,-1073.64)')).toBe('number');
    // rate = 0 branch.
    expect(evalFormula('PV(0,10,-100)')).toBe(1000);
    // fv & type optional.
    expect(evalFormula('PV(0,10,-100,-50)')).toBe(1050);
    expect(typeof evalFormula('PV(0.01,12,-100,0,1)')).toBe('number');
    // Arity & propagation.
    expect(evalFormula('PV(0.1,12)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PV("x",12,-100)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PV(0.1,"x",-100)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PV(0.1,12,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PV(0.1,12,-100,"x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('PV(0.1,12,-100,0,"x")')).toMatchObject({ type: '#VALUE!' });
  });

  it('NPV discounts a stream of cash flows', () => {
    expect(evalFormula('NPV(0.1,3000,4200,6800)')).toBeCloseTo(11307.2878, 3);
    // Range input.
    expect(evalFormula('NPV(0.1,A1:A3)', { '0,0': 3000, '1,0': 4200, '2,0': 6800 })).toBeCloseTo(
      11307.2878,
      3,
    );
    // Arity, propagation, rate=-1 guard.
    expect(evalFormula('NPV(0.1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('NPV("x",100)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('NPV(-1,100)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('NPV(0.1,"x")')).toMatchObject({ type: '#VALUE!' });
  });
});

describe('math / info functions', () => {
  it('MROUND rounds to a multiple', () => {
    expect(evalFormula('MROUND(10,3)')).toBe(9);
    expect(evalFormula('MROUND(-10,-3)')).toBe(-9);
    expect(evalFormula('MROUND(5,0)')).toBe(0);
    expect(evalFormula('MROUND(0,5)')).toBe(0);
    // Mismatched signs -> #NUM!.
    expect(evalFormula('MROUND(10,-3)')).toMatchObject({ type: '#NUM!' });
    // Arity & propagation.
    expect(evalFormula('MROUND(10)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('MROUND("x",3)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('MROUND(10,"x")')).toMatchObject({ type: '#VALUE!' });
  });

  it('EVEN rounds away from zero to an even integer', () => {
    expect(evalFormula('EVEN(3)')).toBe(4);
    expect(evalFormula('EVEN(2)')).toBe(2);
    expect(evalFormula('EVEN(-1)')).toBe(-2);
    expect(evalFormula('EVEN(0)')).toBe(0);
    expect(evalFormula('EVEN(1.5)')).toBe(2);
    // Arity & propagation.
    expect(evalFormula('EVEN()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('EVEN("x")')).toMatchObject({ type: '#VALUE!' });
  });

  it('ODD rounds away from zero to an odd integer', () => {
    expect(evalFormula('ODD(2)')).toBe(3);
    expect(evalFormula('ODD(3)')).toBe(3);
    expect(evalFormula('ODD(0)')).toBe(1);
    expect(evalFormula('ODD(-2)')).toBe(-3);
    expect(evalFormula('ODD(1.5)')).toBe(3);
    // Arity & propagation.
    expect(evalFormula('ODD()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('ODD("x")')).toMatchObject({ type: '#VALUE!' });
  });

  it('ISEVEN / ISODD test parity', () => {
    expect(evalFormula('ISEVEN(4)')).toBe(true);
    expect(evalFormula('ISEVEN(3)')).toBe(false);
    expect(evalFormula('ISEVEN(-2)')).toBe(true);
    expect(evalFormula('ISEVEN(3.9)')).toBe(false);
    expect(evalFormula('ISODD(3)')).toBe(true);
    expect(evalFormula('ISODD(4)')).toBe(false);
    expect(evalFormula('ISODD(-3)')).toBe(true);
    // Arity & propagation.
    expect(evalFormula('ISEVEN()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('ISEVEN("x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('ISODD()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('ISODD("x")')).toMatchObject({ type: '#VALUE!' });
  });
});
