import { test, expect } from '@playwright/test';

test('host collision option syncs, clears readiness, guests cannot edit, and real cars bump',async({browser})=>{
  test.setTimeout(90000);
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  try{
    for(const context of contexts) await context.addInitScript(()=>{ if(window===window.top) localStorage.setItem('boostrack.v2.settings',JSON.stringify({quality:'low',music:0,sfx:0})); });
    const [host,guest]=await Promise.all(contexts.map(c=>c.newPage()));
    for(const page of [host,guest]){await page.goto('/?qa=1');await page.locator('#multiplayer-open').click();}
    await host.locator('#create-room').click();
    await expect(host.locator('#room-code')).toHaveText(/^[A-F0-9]{8}$/);
    await guest.locator('#join-code').fill((await host.locator('#room-code').textContent())!);
    await guest.locator('#join-room').click();
    await expect(guest.locator('#room-collisions')).toHaveValue('off');
    await expect(guest.locator('#room-collisions')).toBeDisabled();
    await host.locator('#ready-room').click();await guest.locator('#ready-room').click();
    await expect(host.locator('#start-room')).toBeEnabled();
    await host.locator('#room-collisions').selectOption('on');
    await expect(guest.locator('#room-collisions')).toHaveValue('on');
    await expect(host.locator('#ready-room')).toHaveText('준비');
    await expect(guest.locator('#ready-room')).toHaveText('준비');
    await host.locator('#ready-room').click();await guest.locator('#ready-room').click();
    await host.locator('#start-room').click();
    await expect.poll(()=>host.evaluate(()=>(window as any).__raceTest.snapshot().state),{timeout:15000}).toBe('running');
    const hp=await host.evaluate(()=>(window as any).__raceTest.snapshot().position);
    const gp=await guest.evaluate(()=>(window as any).__raceTest.snapshot().position);
    expect(Math.hypot(...hp.map((v:number,i:number)=>v-gp[i]))).toBeGreaterThan(4);
    await host.waitForTimeout(2200);
    // Both steer toward the center of the staggered grid using real controls only.
    const driveAt=Date.now()+1000;
    await Promise.all([host,guest].map(page=>page.evaluate(at=>(window as any).__raceTest.setDriver((track:any,car:any)=>({throttle:Date.now()>=at?1:0,steer:-Math.sign(track.nearest(car.position).lateral),brake:false})),driveAt)));
    await expect(host.locator('#toast')).toHaveText('차량 충돌',{timeout:15000});
    await expect(guest.locator('#toast')).toHaveText('차량 충돌',{timeout:5000});
    await host.screenshot({path:'test-results/online-collision.png'});
    await host.locator('#online-leave').click();await guest.locator('#online-leave').click();
  }finally{for(const context of contexts)await context.close();}
});
