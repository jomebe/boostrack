import * as THREE from "three";

// Pure pursuit test driver. Uses throttle/brake/steer only; never moves the body.
export function drive(track, vehicle) {
  const near = track.nearest(vehicle.position);
  const speed = vehicle.velocity.length(),
    look = 8 + speed * 0.45;
  const target = track.sample(near.sample.t + look / track.length);
  for (const [t, side] of track.course.barriers ?? []) {
    const distance = (t - near.sample.t) * track.length;
    if (distance > -9 && distance < 65) {
      target.p.addScaledVector(
        target.right,
        -side * 5 * Math.min(1, (65 - distance) / 30),
      );
      break;
    }
  }
  const local = target.p
    .clone()
    .sub(vehicle.position)
    .applyQuaternion(vehicle.rotation.clone().invert());
  const heading = Math.atan2(local.x, local.z);
  const angle = Math.atan2(4.48 * Math.sin(heading), look);
  const steer = THREE.MathUtils.clamp(
    (angle / (0.46 / (1 + speed * 0.075))) * 1.15,
    -1,
    1,
  );
  const ahead = track.sample(near.sample.t + (look + 14) / track.length);
  const curvature = near.sample.forward.angleTo(ahead.forward) / (look + 14);
  const targetSpeed = Math.min(58, Math.sqrt(10 / Math.max(0.002, curvature)));
  return { throttle: speed > targetSpeed + 1 ? -1 : 1, steer, brake: false };
}
