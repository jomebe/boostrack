import {test,expect} from '@playwright/test';

test('speed widens FOV; mobile reverse works and all five buttons fit',async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?qa=1');await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#play').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__raceTest.snapshot().state),{timeout:15000}).toBe('running');
  const rest=await page.evaluate(()=>(window as any).__raceTest.snapshot().fov);
  expect(rest).toBeGreaterThan(71);expect(rest).toBeLessThan(73);
  await page.keyboard.down('KeyW');
  await expect.poll(()=>page.evaluate(()=>(window as any).__raceTest.snapshot().speed),{timeout:15000}).toBeGreaterThan(90);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(()=>(window as any).__raceTest.snapshot().fov)).toBeGreaterThan(rest+9);
  await page.screenshot({path:'test-results/speed-fov.png'});
  await page.keyboard.press('KeyR');
  await expect.poll(()=>page.evaluate(()=>(window as any).__raceTest.snapshot().state),{timeout:15000}).toBe('running');
  const reverse=page.getByRole('button',{name:'감속 / 후진'}),box=await reverse.boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();
  await expect.poll(()=>page.evaluate(()=>(window as any).__raceTest.snapshot().forwardSpeed),{timeout:10000}).toBeLessThan(-2);
  await page.mouse.up();
  for(const width of [320,390]) {
    await page.setViewportSize({width,height:844});
    const boxes=await page.locator('.touch-controls button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};}));
    expect(boxes).toHaveLength(5);
    for(let i=0;i<boxes.length;i++){expect(boxes[i].left).toBeGreaterThanOrEqual(0);expect(boxes[i].right).toBeLessThanOrEqual(width);expect(boxes[i].width).toBeGreaterThanOrEqual(44);if(i)expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i-1].right);}
  }
  await page.screenshot({path:'test-results/mobile-reverse.png'});
});
