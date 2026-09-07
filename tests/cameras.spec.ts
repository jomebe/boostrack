import {test,expect} from '@playwright/test';

test('four cameras switch without restarting, render distinct views, and persist on mobile',async({page})=>{
  test.setTimeout(60000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?qa=1');await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#play').click();
  const snapshot=()=>page.evaluate(()=>(window as any).__raceTest.snapshot());
  await expect.poll(async()=>(await snapshot()).state,{timeout:15000}).toBe('running');
  const initial=await snapshot();
  for(const mode of ['chase','bumper','hood','top']){
    if(mode!=='chase')await page.keyboard.press('KeyC');
    await expect.poll(async()=>(await snapshot()).cameraMode).toBe(mode);
    await page.waitForTimeout(150);
    const s=await snapshot();expect(s.state).toBe('running');expect(s.time).toBeGreaterThanOrEqual(initial.time);
    expect(s.carVisible).toBe(mode!=='bumper');
    expect(s.cameraPosition.every(Number.isFinite)).toBe(true);
    const height=s.cameraPosition[1]-s.position[1];
    if(mode==='top'){expect(height).toBeGreaterThan(25);expect(s.fov).toBeLessThan(63);}
    if(mode==='hood'||mode==='bumper')expect(height).toBeLessThan(1.5);
    await page.screenshot({path:`test-results/camera-${mode}.png`});
  }
  await page.keyboard.press('KeyC');await expect.poll(async()=>(await snapshot()).cameraMode).toBe('chase');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'카메라 시점 전환'}).click();
  await expect.poll(async()=>(await snapshot()).cameraMode).toBe('bumper');
  await page.reload();await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#play').click();
  await expect.poll(async()=>(await snapshot()).cameraMode).toBe('bumper');
  await expect.poll(async()=>(await snapshot()).carVisible).toBe(false);
  await page.screenshot({path:'test-results/camera-mobile.png'});
  expect(errors).toEqual([]);
});
